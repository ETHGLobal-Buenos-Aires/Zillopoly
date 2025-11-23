#!/bin/bash
# CRE compile script
# Arguments: $1 = input file (main.ts), $2 = output WASM file (tmp.wasm)

INPUT_FILE="$1"
OUTPUT_WASM="$2"
TMP_JS="tmp.js"

echo "Compiling $INPUT_FILE to $OUTPUT_WASM"

# Step 1: Use bun to compile TypeScript to JavaScript
echo "Step 1: Compiling TS to JS..."
bun build "$INPUT_FILE" --outfile "$TMP_JS" --target browser --external buffer --external crypto --external stream --external util

if [ $? -ne 0 ]; then
    echo "Failed to compile TypeScript"
    exit 1
fi

# Step 2: Use Javy to compile JavaScript to WASM
echo "Step 2: Compiling JS to WASM..."
JAVY_PATH="$HOME/.cache/javy/v5.0.4/darwin-arm64/javy"
"$JAVY_PATH" compile "$TMP_JS" -o "$OUTPUT_WASM"

if [ $? -ne 0 ]; then
    echo "Failed to compile to WASM"
    exit 1
fi

echo "Successfully compiled to $OUTPUT_WASM"
exit 0
