"""
Vision Sidecar 方法注册表

管理所有可用的 RPC 方法，提供统一的注册和查找接口。
Sprint: S0-6
"""

from __future__ import annotations

import logging
from typing import Any, Callable, Protocol

logger = logging.getLogger(__name__)


class MethodHandler(Protocol):
    """方法处理器协议"""

    async def __call__(self, **kwargs: Any) -> Any: ...


class MethodRegistry:
    """
    RPC 方法注册表

    集中管理所有可用的 RPC 方法，支持分组注册和文档生成。
    """

    def __init__(self) -> None:
        self._methods: dict[str, MethodHandler] = {}
        self._docs: dict[str, str] = {}
        self._schemas: dict[str, dict[str, Any]] = {}

    def register(
        self,
        method: str,
        handler: MethodHandler,
        doc: str | None = None,
        schema: dict[str, Any] | None = None,
    ) -> None:
        """
        注册 RPC 方法

        Args:
            method: 方法名（如 "vlm.caption"）
            handler: 处理器函数
            doc: 方法文档
            schema: JSON Schema 参数定义
        """
        if method in self._methods:
            logger.warning(f"方法 {method} 已存在，将被覆盖")

        self._methods[method] = handler
        self._docs[method] = doc or handler.__doc__ or ""
        self._schemas[method] = schema or {}

        logger.debug(f"注册方法: {method}")

    def get(self, method: str) -> MethodHandler | None:
        """获取方法处理器"""
        return self._methods.get(method)

    def has(self, method: str) -> bool:
        """检查方法是否存在"""
        return method in self._methods

    def list_methods(self) -> list[str]:
        """列出所有方法"""
        return list(self._methods.keys())

    def get_doc(self, method: str) -> str:
        """获取方法文档"""
        return self._docs.get(method, "")

    def get_schema(self, method: str) -> dict[str, Any]:
        """获取方法参数 Schema"""
        return self._schemas.get(method, {})

    def get_capabilities(self) -> dict[str, Any]:
        """
        获取服务器能力描述

        用于 system.info 响应。
        """
        methods_info = {}
        for method in self._methods:
            methods_info[method] = {
                "doc": self._docs.get(method, ""),
                "schema": self._schemas.get(method, {}),
            }

        return {
            "methods": methods_info,
            "count": len(self._methods),
        }

    def group_register(
        self,
        prefix: str,
        handlers: dict[str, MethodHandler],
    ) -> None:
        """
        批量注册同组方法

        Args:
            prefix: 方法前缀（如 "vlm"）
            handlers: 方法名 -> 处理器的映射
        """
        for name, handler in handlers.items():
            method = f"{prefix}.{name}"
            self.register(method, handler)


# 全局注册表实例
registry = MethodRegistry()


# ============================================================================
# 便捷装饰器
# ============================================================================


def method(
    name: str,
    doc: str | None = None,
    schema: dict[str, Any] | None = None,
) -> Callable[[MethodHandler], MethodHandler]:
    """
    方法注册装饰器

    用法:
        @method("vlm.caption")
        async def caption(image_path: str) -> dict: ...
    """

    def decorator(handler: MethodHandler) -> MethodHandler:
        registry.register(name, handler, doc=doc or handler.__doc__, schema=schema)
        return handler

    return decorator
