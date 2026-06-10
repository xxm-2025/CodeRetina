#!/bin/bash
#
# CodeRetina —— 本地 VLM 模型下载脚本
#
# 用途: 下载 Sprint 1-3 所需的本地模型
# 支持模型:
#   - Moondream 2 (2B, 最轻量)
#   - MiniCPM-V 2.6 (8B, 高性能)
#   - OmniParser v2 (UI 解析)
#   - Florence-2 (OCR/检测)
#
# Sprint: S0-5
# 创建日期: 2026-05-12

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 配置
MODELS_DIR="${MODELS_DIR:-$HOME/.coderetina/models}"
HUGGINGFACE_CACHE="${HF_HOME:-$HOME/.cache/huggingface}"

# 模型配置
# 格式: "模型名称|HuggingFace仓库|需要的文件|简介"
MODELS=(
    "moondream2|vikhyatk/moondream2|moondream-2b-int8.mf|轻量VLM(2B),适合笔记本CPU/GPU"
    "minicpm-v-2.6|openbmb/MiniCPM-V-2_6|*.safetensors|高性能端侧VLM(8B),需24GB内存"
    "florence-2|microsoft/Florence-2-base|*.safetensors|微软多任务视觉模型(OCR/检测/分割)"
)

# OmniParser 单独处理（来自 GitHub）
OMNIPARSER_URL="https://github.com/microsoft/OmniParser"
OMNIPARSER_DIR="$MODELS_DIR/omniparser-v2"

print_header() {
    echo -e "${BLUE}"
    echo "╔══════════════════════════════════════════════════════════╗"
    echo "║       CodeRetina — 模型下载脚本                  ║"
    echo "╚══════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
    echo "模型将下载到: $MODELS_DIR"
    echo "HuggingFace 缓存: $HUGGINGFACE_CACHE"
    echo ""
}

print_help() {
    echo "用法: $0 [选项] [模型名...]"
    echo ""
    echo "可选模型:"
    for model_info in "${MODELS[@]}"; do
        IFS='|' read -r name repo files desc <<< "$model_info"
        echo "  - $name: $desc"
    done
    echo "  - omniparser-v2: 微软 UI 解析模型"
    echo ""
    echo "选项:"
    echo "  --all          下载所有模型"
    echo "  --list         列出可用模型"
    echo "  --check        检查已下载模型"
    echo "  --clean        清理临时文件"
    echo "  --help         显示帮助"
    echo ""
    echo "环境变量:"
    echo "  MODELS_DIR     模型下载目录 (默认: ~/.coderetina/models)"
    echo "  HF_HOME        HuggingFace 缓存目录"
    echo "  HF_TOKEN       HuggingFace 访问令牌(用于 gated 模型)"
}

check_dependencies() {
    local missing=()

    if ! command -v python3 &> /dev/null; then
        missing+=("python3")
    fi

    if ! command -v pip3 &> /dev/null; then
        missing+=("pip3")
    fi

    if ! python3 -c "import huggingface_hub" 2>/dev/null; then
        echo -e "${YELLOW}⚠️  huggingface_hub 未安装，将自动安装...${NC}"
        pip3 install -q huggingface_hub
    fi

    if [ ${#missing[@]} -ne 0 ]; then
        echo -e "${RED}错误: 缺少依赖: ${missing[*]}${NC}"
        exit 1
    fi
}

setup_dirs() {
    mkdir -p "$MODELS_DIR"
    echo -e "${GREEN}✓${NC} 模型目录: $MODELS_DIR"
}

download_hf_model() {
    local name=$1
    local repo=$2
    local pattern=$3

    echo -e "\n${BLUE}📥 下载模型: $name${NC}"
    echo "   仓库: $repo"
    echo "   文件: $pattern"

    local model_dir="$MODELS_DIR/$name"
    mkdir -p "$model_dir"

    # 使用 huggingface-cli 或 Python 下载
    if command -v huggingface-cli &> /dev/null; then
        huggingface-cli download "$repo" \
            --local-dir "$model_dir" \
            --local-dir-use-symlinks False \
            --include "$pattern" \
            ${HF_TOKEN:+--token "$HF_TOKEN"}
    else
        python3 << PYEOF
from huggingface_hub import snapshot_download
import os

try:
    snapshot_download(
        repo_id="$repo",
        local_dir="$model_dir",
        local_dir_use_symlinks=False,
        allow_patterns="$pattern" if "$pattern" != "*.safetensors" else ["*.safetensors", "*.json", "*.txt"],
        token=os.getenv("HF_TOKEN")
    )
    print(f"✓ {name} 下载完成")
except Exception as e:
    print(f"✗ {name} 下载失败: {e}")
    exit(1)
PYEOF
    fi

    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓${NC} $name 下载完成: $model_dir"
    else
        echo -e "${RED}✗${NC} $name 下载失败"
        return 1
    fi
}

download_omniparser() {
    echo -e "\n${BLUE}📥 下载 OmniParser v2${NC}"

    if [ -d "$OMNIPARSER_DIR/.git" ]; then
        echo "OmniParser 已存在，更新中..."
        cd "$OMNIPARSER_DIR"
        git pull
    else
        echo "克隆 OmniParser 仓库..."
        git clone --depth 1 "$OMNIPARSER_URL" "$OMNIPARSER_DIR"
    fi

    # 下载模型权重
    local weights_dir="$OMNIPARSER_DIR/weights"
    mkdir -p "$weights_dir"

    echo "下载 OmniParser 模型权重..."
    python3 << PYEOF
from huggingface_hub import hf_hub_download
import os

# OmniParser 权重在 microsoft/OmniParser 仓库
repo_id = "microsoft/OmniParser"
files = [
    "icon_caption/florence2/icon_caption_model.pth",
    "icon_detect/best.pt"
]

for file in files:
    try:
        path = hf_hub_download(
            repo_id=repo_id,
            filename=file,
            local_dir="$weights_dir",
            local_dir_use_symlinks=False
        )
        print(f"✓ Downloaded: {file}")
    except Exception as e:
        print(f"✗ Failed: {file} - {e}")
PYEOF

    echo -e "${GREEN}✓${NC} OmniParser 准备完成: $OMNIPARSER_DIR"
}

check_models() {
    echo -e "${BLUE}📋 已下载模型检查${NC}\n"

    for model_info in "${MODELS[@]}"; do
        IFS='|' read -r name repo files desc <<< "$model_info"
        local model_dir="$MODELS_DIR/$name"

        if [ -d "$model_dir" ] && [ "$(ls -A "$model_dir" 2>/dev/null)" ]; then
            local size=$(du -sh "$model_dir" 2>/dev/null | cut -f1)
            echo -e "${GREEN}✓${NC} $name ($size): $desc"
        else
            echo -e "${RED}✗${NC} $name: 未下载"
        fi
    done

    if [ -d "$OMNIPARSER_DIR" ]; then
        local size=$(du -sh "$OMNIPARSER_DIR" 2>/dev/null | cut -f1)
        echo -e "${GREEN}✓${NC} omniparser-v2 ($size): UI 解析模型"
    else
        echo -e "${RED}✗${NC} omniparser-v2: 未下载"
    fi
}

clean_temp() {
    echo -e "${YELLOW}🧹 清理临时文件...${NC}"
    find "$MODELS_DIR" -name "*.tmp" -delete 2>/dev/null || true
    find "$MODELS_DIR" -name "*.partial" -delete 2>/dev/null || true
    echo -e "${GREEN}✓${NC} 清理完成"
}

list_models() {
    echo -e "${BLUE}📦 可用模型列表${NC}\n"

    for model_info in "${MODELS[@]}"; do
        IFS='|' read -r name repo files desc <<< "$model_info"
        echo -e "${YELLOW}$name${NC}"
        echo "  描述: $desc"
        echo "  仓库: $repo"
        echo "  文件: $files"
        echo ""
    done

    echo -e "${YELLOW}omniparser-v2${NC}"
    echo "  描述: 微软 UI 解析模型，用于屏幕元素检测"
    echo "  仓库: $OMNIPARSER_URL"
}

# 主函数
main() {
    local models_to_download=()
    local download_all=false

    # 解析参数
    while [[ $# -gt 0 ]]; do
        case $1 in
            --help|-h)
                print_help
                exit 0
                ;;
            --list|-l)
                list_models
                exit 0
                ;;
            --check|-c)
                check_models
                exit 0
                ;;
            --clean)
                clean_temp
                exit 0
                ;;
            --all|-a)
                download_all=true
                shift
                ;;
            -*)
                echo -e "${RED}错误: 未知选项 $1${NC}"
                print_help
                exit 1
                ;;
            *)
                models_to_download+=("$1")
                shift
                ;;
        esac
    done

    print_header
    check_dependencies
    setup_dirs

    # 如果没有指定模型，默认下载 moondream2（最轻量）
    if [ "$download_all" = false ] && [ ${#models_to_download[@]} -eq 0 ]; then
        echo -e "${YELLOW}⚠️  未指定模型，默认下载 moondream2 (最轻量, 2B参数)${NC}"
        echo "使用 --all 下载所有模型，或使用 --list 查看可用模型"
        echo ""
        models_to_download+=("moondream2")
    fi

    # 下载所有模型
    if [ "$download_all" = true ]; then
        for model_info in "${MODELS[@]}"; do
            IFS='|' read -r name repo files _ <<< "$model_info"
            download_hf_model "$name" "$repo" "$files"
        done
        download_omniparser
    else
        # 下载指定模型
        for model_name in "${models_to_download[@]}"; do
            case "$model_name" in
                omniparser|omniparser-v2|omniparser2)
                    download_omniparser
                    ;;
                *)
                    # 在 MODELS 数组中查找
                    local found=false
                    for model_info in "${MODELS[@]}"; do
                        IFS='|' read -r name repo files _ <<< "$model_info"
                        if [ "$name" = "$model_name" ]; then
                            download_hf_model "$name" "$repo" "$files"
                            found=true
                            break
                        fi
                    done
                    if [ "$found" = false ]; then
                        echo -e "${RED}错误: 未知模型 '$model_name'${NC}"
                        echo "使用 --list 查看可用模型"
                    fi
                    ;;
            esac
        done
    fi

    echo ""
    echo -e "${GREEN}══════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}                  模型下载完成!${NC}"
    echo -e "${GREEN}══════════════════════════════════════════════════════════${NC}"
    echo ""
    check_models
}

main "$@"
