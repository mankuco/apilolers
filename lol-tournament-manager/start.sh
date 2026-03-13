#!/bin/bash
# LoL Tournament Manager — Single-command launcher
# No Node.js required! Frontend is pre-built.

echo ""
echo "  🏆  LoL Tournament Manager"
echo "  =========================="
echo ""

cd "$(dirname "$0")"

# Install Python deps if missing
python3 -c "import uvicorn" 2>/dev/null || {
    echo "  Installing Python dependencies..."
    pip3 install fastapi uvicorn httpx
}

echo "  Starting server..."
echo ""
echo "  ✅  Open http://localhost:8000 in your browser"
echo "      Press Ctrl+C to stop"
echo ""

python3 -m uvicorn api:app --reload --port 8000
