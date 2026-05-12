"""
Vision Sidecar JSON-RPC 服务器

通过 stdio 与 TypeScript 主进程通信，支持 LSP 风格消息格式。
Sprint: S0-6
"""

from __future__ import annotations

import asyncio
import json
import logging
import sys
from dataclasses import dataclass, field
from typing import Any, Callable, Protocol

# 配置日志到 stderr，避免污染 stdout
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    stream=sys.stderr,
)
logger = logging.getLogger(__name__)


class RPCHandler(Protocol):
    """RPC 处理器协议"""

    async def __call__(self, **kwargs: Any) -> Any: ...


@dataclass
class RPCRequest:
    """RPC 请求"""

    id: str | None
    method: str
    params: dict[str, Any] = field(default_factory=dict)


@dataclass
class RPCResponse:
    """RPC 响应"""

    id: str | None
    result: Any = None
    error: dict[str, Any] | None = None

    def to_dict(self) -> dict[str, Any]:
        """转换为字典"""
        result_dict: dict[str, Any] = {
            "jsonrpc": "2.0",
            "id": self.id,
        }
        if self.error:
            result_dict["error"] = self.error
        else:
            result_dict["result"] = self.result
        return result_dict


@dataclass
class RPCNotification:
    """RPC 通知（无需响应）"""

    method: str
    params: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        """转换为字典"""
        return {
            "jsonrpc": "2.0",
            "method": self.method,
            "params": self.params,
        }


class SidecarServer:
    """
    Vision Sidecar JSON-RPC 服务器

    通过 stdin/stdout 与 TypeScript 主进程通信。
    使用 Content-Length 头部格式（LSP 风格）。
    """

    def __init__(self) -> None:
        self.methods: dict[str, RPCHandler] = {}
        self.running = False
        self._reader = asyncio.StreamReader()
        self._writer: asyncio.StreamWriter | None = None

    def register(self, method: str, handler: RPCHandler) -> None:
        """注册 RPC 方法"""
        self.methods[method] = handler
        logger.debug(f"注册方法: {method}")

    async def run(self) -> None:
        """主循环：从 stdin 读取，向 stdout 写入"""
        self.running = True
        logger.info("Vision Sidecar 启动")
        print("Vision Sidecar ready", flush=True, file=sys.stderr)

        # 设置 stdin/stdout
        loop = asyncio.get_event_loop()
        transport = asyncio.StreamReaderProtocol(self._reader)
        await loop.connect_read_pipe(lambda: transport, sys.stdin)

        w_transport, w_protocol = await loop.connect_write_pipe(
            lambda: asyncio.StreamReaderProtocol(asyncio.StreamReader()),
            sys.stdout,
        )
        self._writer = asyncio.StreamWriter(w_transport, w_protocol, None, loop)

        try:
            while self.running:
                message = await self._read_message()
                if message is None:
                    logger.info("连接关闭，退出")
                    break

                response = await self._handle_message(message)
                if response:
                    await self._write_response(response)
        except asyncio.CancelledError:
            logger.info("服务器被取消")
        except Exception as e:
            logger.exception(f"服务器错误: {e}")
        finally:
            await self.shutdown()

    async def shutdown(self) -> None:
        """优雅关闭"""
        self.running = False
        if self._writer:
            self._writer.close()
            await self._writer.wait_closed()
        logger.info("Vision Sidecar 已关闭")

    async def _read_message(self) -> str | None:
        """
        读取 LSP 格式消息

        格式:
            Content-Length: <length>\r\n
            \r\n
            <json body>
        """
        # 读取头部
        header_lines: list[str] = []
        while True:
            line = await self._reader.readline()
            if not line:
                return None  # EOF

            line_str = line.decode("utf-8").strip()
            if not line_str:
                break  # 空行表示头部结束
            header_lines.append(line_str)

        # 解析 Content-Length
        content_length = 0
        for line in header_lines:
            if line.startswith("Content-Length:"):
                try:
                    content_length = int(line.split(":")[1].strip())
                except (ValueError, IndexError):
                    logger.error(f"无效的 Content-Length: {line}")
                    return None

        if content_length <= 0:
            logger.warning("未找到 Content-Length 或为 0")
            return None

        # 读取 body
        body = await self._reader.read(content_length)
        if len(body) < content_length:
            logger.error(f"读取不完整: {len(body)} < {content_length}")
            return None

        return body.decode("utf-8")

    async def _handle_message(self, message: str) -> RPCResponse | None:
        """处理消息"""
        try:
            data = json.loads(message)
        except json.JSONDecodeError as e:
            logger.error(f"JSON 解析错误: {e}")
            return RPCResponse(
                id=None,
                error={"code": -32700, "message": f"Parse error: {e}"},
            )

        # 验证 JSON-RPC 版本
        if data.get("jsonrpc") != "2.0":
            return RPCResponse(
                id=data.get("id"),
                error={"code": -32600, "message": "Invalid Request: 仅支持 jsonrpc 2.0"},
            )

        method = data.get("method")
        if not method:
            return RPCResponse(
                id=data.get("id"),
                error={"code": -32600, "message": "Invalid Request: 缺少 method"},
            )

        # 检查是否为通知（无 id）
        is_notification = "id" not in data

        # 处理系统通知
        if is_notification:
            await self._handle_notification(method, data.get("params", {}))
            return None

        # 处理请求
        request = RPCRequest(
            id=data.get("id"),
            method=method,
            params=data.get("params", {}),
        )
        return await self._handle_request(request)

    async def _handle_request(self, request: RPCRequest) -> RPCResponse:
        """处理 RPC 请求"""
        handler = self.methods.get(request.method)

        if not handler:
            logger.warning(f"未知方法: {request.method}")
            return RPCResponse(
                id=request.id,
                error={
                    "code": -32601,
                    "message": f"Method '{request.method}' not found",
                },
            )

        try:
            result = await handler(**request.params)
            return RPCResponse(id=request.id, result=result)
        except Exception as e:
            logger.exception(f"处理 {request.method} 时出错: {e}")
            return RPCResponse(
                id=request.id,
                error={"code": -32603, "message": f"Internal error: {str(e)}"},
            )

    async def _handle_notification(self, method: str, params: dict) -> None:
        """处理通知（无需响应）"""
        if method == "$/cancelRequest":
            logger.info(f"取消请求: {params.get('id')}")
        elif method == "system.shutdown":
            logger.info("收到关闭通知")
            self.running = False
        else:
            logger.debug(f"忽略通知: {method}")

    async def _write_response(self, response: RPCResponse) -> None:
        """写入 LSP 格式响应"""
        if not self._writer:
            return

        json_str = json.dumps(response.to_dict(), ensure_ascii=False)
        message = f"Content-Length: {len(json_str.encode('utf-8'))}\r\n\r\n{json_str}"

        self._writer.write(message.encode("utf-8"))
        await self._writer.drain()
        logger.debug(f"发送响应: {response.id}")

    async def send_notification(self, notification: RPCNotification) -> None:
        """发送通知到客户端"""
        if not self._writer:
            return

        json_str = json.dumps(notification.to_dict(), ensure_ascii=False)
        message = f"Content-Length: {len(json_str.encode('utf-8'))}\r\n\r\n{json_str}"

        self._writer.write(message.encode("utf-8"))
        await self._writer.drain()


# ============================================================================
# Echo 测试方法（S0-6 验证用）
# ============================================================================


async def echo_handler(message: str = "") -> dict[str, Any]:
    """
    Echo 测试处理器

    用于验证 TypeScript ↔ Python 通信正常。
    """
    return {
        "echo": message,
        "timestamp": asyncio.get_event_loop().time(),
        "status": "ok",
    }


async def health_handler() -> dict[str, Any]:
    """健康检查"""
    return {
        "status": "healthy",
        "version": "0.1.0",
        "methods": list(server.methods.keys()) if "server" in globals() else [],
    }


async def system_info_handler() -> dict[str, Any]:
    """系统信息"""
    import platform

    return {
        "platform": platform.system(),
        "python_version": platform.python_version(),
        "protocol_version": "1.0",
        "capabilities": {
            "streaming": True,
            "models": [],  # Sprint 1 填充
        },
    }


# ============================================================================
# 入口点
# ============================================================================


async def main():
    """服务器入口"""
    import argparse

    parser = argparse.ArgumentParser(description="Vision Sidecar Server")
    parser.add_argument(
        "--echo-test",
        action="store_true",
        help="运行 echo 测试模式（阻塞式）",
    )
    parser.add_argument(
        "--log-level",
        default="INFO",
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
        help="日志级别",
    )
    args = parser.parse_args()

    # 设置日志级别
    logging.getLogger().setLevel(getattr(logging, args.log_level))

    server = SidecarServer()

    # 注册基础方法
    server.register("echo", echo_handler)
    server.register("health.ping", health_handler)
    server.register("system.info", system_info_handler)
    server.register("system.initialize", lambda **kw: {"ok": True, "version": "1.0"})

    # 注册各 Sprint 方法
    try:
        from .methods.register_all import register_all

        register_all(server)
    except ImportError as e:
        logger.warning(f"方法注册模块加载失败: {e}")

    if args.echo_test:
        # 测试模式：直接调用 echo
        print("Echo test mode", file=sys.stderr)
        result = await echo_handler("Hello from Vision Sidecar!")
        print(json.dumps(result, indent=2), file=sys.stderr)

        # 同时测试 vlm.caption
        try:
            from .methods.vlm import caption

            caption_result = await caption("/tmp/test.png")
            print("\nvlm.caption test:", file=sys.stderr)
            print(json.dumps(caption_result, indent=2), file=sys.stderr)
        except Exception as e:
            print(f"vlm.caption test failed: {e}", file=sys.stderr)

        return

    # 正常服务模式
    await server.run()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("收到键盘中断，退出")
        sys.exit(0)
