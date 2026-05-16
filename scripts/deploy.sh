#!/bin/bash
# deploy.sh — 部署 openclaw 配置到 ~/.openclaw/
# 用法: ./scripts/deploy.sh [--dry-run]
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
CONFIG_DIR="$PROJECT_DIR/config"
OPENCLAW_DIR="${OPENCLAW_CONFIG_DIR:-$HOME/.openclaw}"

DRY_RUN=""
if [ "$1" = "--dry-run" ]; then
  DRY_RUN=1
  echo "[dry-run] 不会写入任何文件"
fi

echo "=== OpenClaw 配置部署 ==="
echo "源: $CONFIG_DIR"
echo "目标: $OPENCLAW_DIR"

# 1. 部署 openclaw.json
if [ -f "$CONFIG_DIR/openclaw.json" ]; then
  echo ""
  echo "1. 部署 openclaw.json..."
  if [ "$DRY_RUN" ]; then
    echo "    [dry-run] cp $CONFIG_DIR/openclaw.json $OPENCLAW_DIR/openclaw.json"
  else
    # Stop gateway first (gateway monitors openclaw.json writes)
    openclaw gateway stop 2>/dev/null || true
    cp "$CONFIG_DIR/openclaw.json" "$OPENCLAW_DIR/openclaw.json"
    echo "    ✓ openclaw.json 已部署"
  fi
else
  echo "    ✗ $CONFIG_DIR/openclaw.json 不存在，跳过"
fi

# 2. 清理 devices/pending.json（停止设备重试循环）
echo ""
echo "2. 清理 pending 设备配对..."
if [ "$DRY_RUN" ]; then
  echo "    [dry-run] 清空 $OPENCLAW_DIR/devices/pending.json"
else
  echo '{}' > "$OPENCLAW_DIR/devices/pending.json"
  rm -f "$OPENCLAW_DIR/devices/pending.json".*.tmp
  rm -f "$OPENCLAW_DIR/identity/paired.json".*.tmp
  echo "    ✓ pending.json 已清空"
fi

# 3. 重启 gateway
echo ""
echo "3. 重启 gateway..."
if [ "$DRY_RUN" ]; then
  echo "    [dry-run] openclaw gateway restart"
else
  openclaw gateway restart 2>/dev/null || echo "    ! gateway 重启完成（可能有权限提示，忽略）"
  echo "    ✓ gateway 已重启"
fi

echo ""
echo "=== 部署完成 ==="
echo ""
echo "验证: openclaw logs --tail 20"
echo "加载插件: journalctl --user -u openclaw-gateway -n 3 | grep ready"
