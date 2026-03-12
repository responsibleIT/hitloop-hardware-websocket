#!/bin/bash
# Upload firmware to a specific serial port using esptool.py
#
# Usage:
#   ./upload.sh <PORT> [BOARD]
#
# Arguments:
#   PORT   Serial port, e.g. /dev/cu.usbmodem1234 or COM5
#   BOARD  PlatformIO env name: seeed_xiao_esp32c3 (default) or esp32-c3-devkitm-1
#
# Examples:
#   ./upload.sh /dev/cu.usbmodem142301
#   ./upload.sh /dev/cu.usbmodem142301 esp32-c3-devkitm-1

set -e

PORT="${1}"
BOARD="${2:-seeed_xiao_esp32c3}"

if [ -z "$PORT" ]; then
  echo "Error: serial port required."
  echo "Usage: $0 <PORT> [BOARD]"
  echo "       BOARD: seeed_xiao_esp32c3 (default) | esp32-c3-devkitm-1"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BUILD_DIR="$SCRIPT_DIR/.pio/build/$BOARD"
PIO_PYTHON="$HOME/.platformio/penv/bin/python3"
ESPTOOL="$HOME/.platformio/packages/tool-esptoolpy/esptool.py"
BOOT_APP0="$HOME/.platformio/packages/framework-arduinoespressif32/tools/partitions/boot_app0.bin"

# Verify build artifacts exist
for f in "$BUILD_DIR/bootloader.bin" "$BUILD_DIR/partitions.bin" "$BUILD_DIR/firmware.bin"; do
  if [ ! -f "$f" ]; then
    echo "Error: missing $f"
    echo "Run 'pio run -e $BOARD' first to build the firmware."
    exit 1
  fi
done

echo "Board  : $BOARD"
echo "Port   : $PORT"
echo "Build  : $BUILD_DIR"
echo ""

"$PIO_PYTHON" "$ESPTOOL" \
  --chip esp32c3 \
  --port "$PORT" \
  --baud 921600 \
  --before default_reset \
  --after hard_reset \
  write_flash \
  --flash_mode qio \
  --flash_freq 80m \
  --flash_size detect \
  0x0000  "$BUILD_DIR/bootloader.bin" \
  0x8000  "$BUILD_DIR/partitions.bin" \
  0xe000  "$BOOT_APP0" \
  0x10000 "$BUILD_DIR/firmware.bin"

echo ""
echo "Upload complete."
