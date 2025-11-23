#!/bin/bash

# Script to install Chainlink CRE CLI
# This script will retry the installation if rate-limited

echo "Installing Chainlink CRE CLI..."
echo ""

MAX_RETRIES=5
RETRY_DELAY=10

for i in $(seq 1 $MAX_RETRIES); do
    echo "Attempt $i of $MAX_RETRIES..."
    
    # Try to install
    if curl -sSL https://cre.chain.link/install.sh | sh; then
        echo ""
        echo "✓ CRE CLI installed successfully!"
        
        # Verify installation
        if command -v cre &> /dev/null; then
            echo ""
            echo "Verifying installation..."
            cre version
            exit 0
        else
            echo ""
            echo "⚠ Installation may have completed, but 'cre' command not found in PATH"
            echo "You may need to add /usr/local/bin to your PATH or restart your terminal"
            exit 0
        fi
    else
        if [ $i -lt $MAX_RETRIES ]; then
            echo "⚠ Installation failed (possibly rate-limited). Waiting ${RETRY_DELAY} seconds before retry..."
            sleep $RETRY_DELAY
            RETRY_DELAY=$((RETRY_DELAY * 2)) # Exponential backoff
        else
            echo ""
            echo "✗ Installation failed after $MAX_RETRIES attempts"
            echo ""
            echo "The installation script appears to be rate-limited."
            echo "Please try again later, or check the official documentation:"
            echo "https://docs.chain.link/cre/getting-started/cli-installation/macos-linux"
            exit 1
        fi
    fi
done

