#!/bin/bash
#
# GUI Agent Sandbox —— Docker + Xvfb 安全运行环境
#
# 功能：
# - 启动隔离的 GUI 环境
# - 所有操作在容器内执行
# - 支持 VNC 查看
# - 支持录屏
#
# Sprint: S3-3
# 创建日期: 2026-05-12

set -e

# 配置
IMAGE_NAME="claude-code-vision-gui"
CONTAINER_NAME="gui-sandbox"
VNC_PORT=5900
HTTP_PORT=6080

# 颜色
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

show_help() {
    echo "GUI Agent Sandbox - Docker + Xvfb 安全环境"
    echo ""
    echo "Usage: $0 [command]"
    echo ""
    echo "Commands:"
    echo "  start       启动沙箱容器"
    echo "  stop        停止沙箱容器"
    echo "  restart     重启沙箱容器"
    echo "  build       构建 Docker 镜像"
    echo "  vnc         显示 VNC 连接信息"
    echo "  shell       进入容器 shell"
    echo "  record      开始录屏"
    echo "  screenshot  截取屏幕"
    echo "  status      显示状态"
    echo "  logs        显示容器日志"
    echo "  clean       清理所有资源"
    echo ""
    echo "Examples:"
    echo "  $0 start          # 启动沙箱"
    echo "  $0 vnc            # 获取 VNC 连接信息"
    echo "  $0 screenshot     # 截取当前屏幕"
    echo "  $0 stop           # 停止沙箱"
}

# 检查 Docker
check_docker() {
    if ! command -v docker &> /dev/null; then
        echo -e "${RED}错误: Docker 未安装${NC}"
        echo "请安装 Docker: https://docs.docker.com/get-docker/"
        exit 1
    fi

    if ! docker info &> /dev/null; then
        echo -e "${RED}错误: Docker 守护进程未运行${NC}"
        exit 1
    fi
}

# 构建镜像
build_image() {
    echo -e "${BLUE}构建 GUI Sandbox 镜像...${NC}"

    # 创建临时 Dockerfile
    TEMP_DIR=$(mktemp -d)
    cat > "$TEMP_DIR/Dockerfile" << 'EOF'
FROM ubuntu:22.04

# 安装基础依赖
RUN apt-get update && apt-get install -y \
    xvfb \
    x11vnc \
    fluxbox \
    wmctrl \
    xdotool \
    scrot \
    ffmpeg \
    python3 \
    python3-pip \
    python3-opencv \
    chromium-browser \
    firefox \
    libgl1-mesa-glx \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    wget \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

# 安装 Python GUI 自动化库
RUN pip3 install --no-cache-dir \
    pyautogui \
    pillow \
    opencv-python \
    numpy \
    easyocr \
    playwright \
    && playwright install chromium

# 设置显示环境
ENV DISPLAY=:99
ENV SCREEN_WIDTH=1280
ENV SCREEN_HEIGHT=720
ENV SCREEN_DEPTH=24

# 创建工作目录
WORKDIR /workspace

# 复制启动脚本
COPY start.sh /start.sh
RUN chmod +x /start.sh

EXPOSE 5900 6080

CMD ["/start.sh"]
EOF

    # 创建启动脚本
    cat > "$TEMP_DIR/start.sh" << 'EOF'
#!/bin/bash

# 启动 Xvfb
Xvfb :99 -screen 0 ${SCREEN_WIDTH}x${SCREEN_HEIGHT}x${SCREEN_DEPTH} +extension GLX +render -noreset &
sleep 2

# 启动窗口管理器
fluxbox &
sleep 1

# 启动 VNC
x11vnc -display :99 -forever -usepw -shared -rfbport 5900 &

# 启动 noVNC（可选）
if command -v websockify &> /dev/null; then
    websockify -D --web=/usr/share/novnc 6080 localhost:5900
fi

# 保持运行
tail -f /dev/null
EOF

    docker build -t "$IMAGE_NAME" "$TEMP_DIR"
    rm -rf "$TEMP_DIR"

    echo -e "${GREEN}✓ 镜像构建完成: $IMAGE_NAME${NC}"
}

# 启动容器
start_container() {
    check_docker

    # 检查是否已存在
    if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        echo -e "${YELLOW}容器已存在，启动中...${NC}"
        docker start "$CONTAINER_NAME"
    else
        echo -e "${BLUE}创建新容器...${NC}"

        # 检查镜像是否存在
        if ! docker images --format '{{.Repository}}' | grep -q "^${IMAGE_NAME}$"; then
            build_image
        fi

        # 创建容器
        docker run -d \
            --name "$CONTAINER_NAME" \
            -p "$VNC_PORT:5900" \
            -p "$HTTP_PORT:6080" \
            -v "$(pwd):/workspace" \
            -e SCREEN_WIDTH=1280 \
            -e SCREEN_HEIGHT=720 \
            -e SCREEN_DEPTH=24 \
            --ipc=host \
            --shm-size=2g \
            "$IMAGE_NAME"
    fi

    # 等待服务启动
    echo -e "${BLUE}等待服务启动...${NC}"
    sleep 3

    # 检查状态
    if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        echo -e "${GREEN}✓ GUI Sandbox 运行中${NC}"
        echo ""
        echo "连接方式:"
        echo "  VNC: vnc://localhost:$VNC_PORT"
        echo "  HTTP: http://localhost:$HTTP_PORT (noVNC)"
        echo ""
        echo "默认密码: password"
        echo ""
        echo "查看屏幕:"
        echo "  1. 使用 VNC 客户端连接 localhost:$VNC_PORT"
        echo "  2. 或打开浏览器访问 http://localhost:$HTTP_PORT"
    else
        echo -e "${RED}✗ 启动失败${NC}"
        docker logs "$CONTAINER_NAME" 2>&1 | tail -20
        exit 1
    fi
}

# 停止容器
stop_container() {
    echo -e "${BLUE}停止 GUI Sandbox...${NC}"

    if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        docker stop "$CONTAINER_NAME"
        echo -e "${GREEN}✓ 已停止${NC}"
    else
        echo -e "${YELLOW}容器未运行${NC}"
    fi
}

# 显示 VNC 信息
show_vnc() {
    if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        echo -e "${RED}错误: 沙箱未运行${NC}"
        echo "请先运行: $0 start"
        exit 1
    fi

    echo -e "${BLUE}VNC 连接信息${NC}"
    echo ""
    echo "主机: localhost"
    echo "端口: $VNC_PORT"
    echo "密码: password"
    echo ""
    echo "快速连接命令:"
    echo "  open vnc://localhost:$VNC_PORT  (macOS)"
    echo "  vncviewer localhost:$VNC_PORT     (Linux)"
}

# 进入容器 shell
enter_shell() {
    if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        echo -e "${RED}错误: 沙箱未运行${NC}"
        exit 1
    fi

    echo -e "${BLUE}进入容器 shell...${NC}"
    docker exec -it "$CONTAINER_NAME" /bin/bash
}

# 录屏
start_recording() {
    if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        echo -e "${RED}错误: 沙箱未运行${NC}"
        exit 1
    fi

    local output_file="/workspace/recording_$(date +%Y%m%d_%H%M%S).mp4"

    echo -e "${BLUE}开始录屏...${NC}"
    echo "输出文件: $output_file"
    echo "按 Ctrl+C 停止"

    docker exec "$CONTAINER_NAME" ffmpeg \
        -f x11grab \
        -r 30 \
        -s 1280x720 \
        -i :99 \
        -c:v libx264 \
        -preset fast \
        -pix_fmt yuv420p \
        "$output_file" \
        2>&1 | grep -E "(frame|Press|Conversion)" || true

    echo -e "${GREEN}✓ 录屏已保存: $output_file${NC}"
}

# 截图
take_screenshot() {
    if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        echo -e "${RED}错误: 沙箱未运行${NC}"
        exit 1
    fi

    local output_file="/workspace/screenshot_$(date +%Y%m%d_%H%M%S).png"

    echo -e "${BLUE}截取屏幕...${NC}"

    docker exec "$CONTAINER_NAME" import -window root "$output_file"

    echo -e "${GREEN}✓ 截图已保存${NC}"
    echo "文件: $output_file"

    # 如果本地有文件，显示路径
    local local_file="$(pwd)/screenshot_$(date +%Y%m%d_%H%M%S).png"
    if [ -f "$local_file" ]; then
        echo "本地路径: $local_file"
        ls -lh "$local_file"
    fi
}

# 显示状态
show_status() {
    echo -e "${BLUE}GUI Sandbox 状态${NC}"
    echo ""

    if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        echo -e "状态: ${GREEN}运行中${NC}"
        echo ""
        echo "容器信息:"
        docker ps --filter "name=$CONTAINER_NAME" --format "  ID: {{.ID}}\n  镜像: {{.Image}}\n  启动时间: {{.RunningFor}}"
        echo ""
        echo "端口映射:"
        docker port "$CONTAINER_NAME"
        echo ""
        echo "资源使用:"
        docker stats "$CONTAINER_NAME" --no-stream --format "  CPU: {{.CPUPerc}}\n  内存: {{.MemUsage}}"
    else
        echo -e "状态: ${RED}未运行${NC}"

        if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
            echo ""
            echo "容器存在但已停止。启动命令:"
            echo "  $0 start"
        fi
    fi
}

# 显示日志
show_logs() {
    if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        echo -e "${BLUE}容器日志:${NC}"
        docker logs "$CONTAINER_NAME" -f
    else
        echo -e "${RED}容器不存在${NC}"
    fi
}

# 清理
clean_all() {
    echo -e "${YELLOW}警告: 这将删除所有沙箱相关资源${NC}"
    read -p "确认继续? [y/N] " -n 1 -r
    echo

    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${BLUE}清理资源...${NC}"

        # 停止并删除容器
        docker stop "$CONTAINER_NAME" 2>/dev/null || true
        docker rm "$CONTAINER_NAME" 2>/dev/null || true

        # 删除镜像
        docker rmi "$IMAGE_NAME" 2>/dev/null || true

        echo -e "${GREEN}✓ 清理完成${NC}"
    fi
}

# 主入口
case "${1:-}" in
    start)
        start_container
        ;;
    stop)
        stop_container
        ;;
    restart)
        stop_container
        sleep 2
        start_container
        ;;
    build)
        build_image
        ;;
    vnc)
        show_vnc
        ;;
    shell)
        enter_shell
        ;;
    record)
        start_recording
        ;;
    screenshot)
        take_screenshot
        ;;
    status)
        show_status
        ;;
    logs)
        show_logs
        ;;
    clean)
        clean_all
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        show_help
        exit 1
        ;;
esac
