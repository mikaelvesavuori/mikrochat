#!/bin/bash

set -e

MIKROCHAT_CLI_VERSION="1"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

BIN_DIR="$HOME/.local/bin"

print_error() {
    echo -e "${RED}Error: $1${NC}" >&2
}

print_success() {
    echo -e "${GREEN}$1${NC}"
}

print_info() {
    echo -e "${YELLOW}$1${NC}"
}

create_cli() {
    mkdir -p "$BIN_DIR"

    cat > "$BIN_DIR/mikrochat" << 'EOF'
#!/bin/bash

INSTALL_DIR="$HOME/.mikrochat"
VERSION_FILE="$INSTALL_DIR/VERSION"
API_FILE="$INSTALL_DIR/api/mikrochat.mjs"
APP_DIR="$INSTALL_DIR/app"
DOWNLOAD_BASE="https://releases.mikrochat.com"

print_error() {
    echo -e "\033[0;31mError: $1\033[0m" >&2
}

print_success() {
    echo -e "\033[0;32m$1\033[0m"
}

print_info() {
    echo -e "\033[1;33m$1\033[0m"
}

check_node() {
    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed"
        echo "Install Node.js 24 or later from https://nodejs.org/"
        exit 1
    fi

    NODE_VERSION=$(node -v | cut -d 'v' -f 2 | cut -d '.' -f 1)
    if [ "$NODE_VERSION" -lt 24 ]; then
        print_error "Node.js 24 or later is required (found v$(node -v | cut -d 'v' -f 2))"
        echo "Upgrade Node.js from https://nodejs.org/"
        exit 1
    fi

    print_success "Node.js v$(node -v | cut -d 'v' -f 2) detected"
}

mikrochat_install() {
    print_info "Installing MikroChat..."

    check_node

    mkdir -p "$INSTALL_DIR"

    print_info "Downloading latest release from $DOWNLOAD_BASE..."
    TEMP_FILE="/tmp/mikrochat_latest.zip"

    if command -v curl &> /dev/null; then
        curl -sSL -o "$TEMP_FILE" "$DOWNLOAD_BASE/mikrochat_latest.zip"
    elif command -v wget &> /dev/null; then
        wget -q -O "$TEMP_FILE" "$DOWNLOAD_BASE/mikrochat_latest.zip"
    else
        print_error "Neither curl nor wget is available"
        exit 1
    fi

    print_info "Extracting..."
    TEMP_EXTRACT="/tmp/mikrochat_extract_$$"
    mkdir -p "$TEMP_EXTRACT"

    if command -v unzip &> /dev/null; then
        unzip -q -o "$TEMP_FILE" -d "$TEMP_EXTRACT"
    else
        print_error "unzip is not installed"
        echo "Install it with: sudo apt install unzip (Debian/Ubuntu) or brew install unzip (macOS)"
        exit 1
    fi

    rm "$TEMP_FILE"

    # Handle nested directory structure from zip
    if [ -d "$TEMP_EXTRACT/mikrochat" ]; then
        cp -r "$TEMP_EXTRACT/mikrochat"/* "$INSTALL_DIR/"
    elif [ -f "$TEMP_EXTRACT/api/mikrochat.mjs" ]; then
        cp -r "$TEMP_EXTRACT"/* "$INSTALL_DIR/"
    else
        SUBDIR=$(find "$TEMP_EXTRACT" -name "mikrochat.mjs" -type f | head -n 1 | xargs dirname 2>/dev/null)
        if [ -n "$SUBDIR" ]; then
            PARENT=$(dirname "$SUBDIR")
            cp -r "$PARENT"/* "$INSTALL_DIR/"
        else
            print_error "Could not find mikrochat.mjs in the downloaded archive"
            rm -rf "$TEMP_EXTRACT"
            exit 1
        fi
    fi

    rm -rf "$TEMP_EXTRACT"

    if [ ! -f "$API_FILE" ]; then
        print_error "Installation failed: mikrochat.mjs not found after extraction"
        exit 1
    fi

    echo ""
    if [ -f "$VERSION_FILE" ]; then
        INSTALLED_VERSION=$(cat "$VERSION_FILE" | tr -d '[:space:]')
        print_success "MikroChat v$INSTALLED_VERSION installed!"
    else
        print_success "MikroChat installed!"
    fi

    echo ""
    print_info "Next: run 'mikrochat init' in your project directory, then 'mikrochat start'"
}

mikrochat_init() {
    if [ ! -d "$INSTALL_DIR" ]; then
        print_error "MikroChat is not installed. Run 'mikrochat install' first."
        exit 1
    fi

    # Create config file
    if [ -f "mikrochat.config.json" ]; then
        print_info "mikrochat.config.json already exists, skipping"
    else
        print_info "Creating mikrochat.config.json..."

        cat > "mikrochat.config.json" << 'CONFIGEOF'
{
  "auth": {
    "authMode": "password",
    "jwtSecret": "CHANGE-ME-use-a-random-string-at-least-32-characters",
    "appUrl": "http://localhost:8000",
    "isInviteRequired": false
  },
  "chat": {
    "initialUser": {
      "userName": "admin",
      "email": "admin@yourdomain.com"
    }
  },
  "email": {
    "user": "",
    "host": "",
    "password": ""
  },
  "server": {
    "allowedDomains": ["*"]
  }
}
CONFIGEOF

        print_success "mikrochat.config.json created"
        print_info "Edit it to set your JWT secret, initial user, and (optionally) email settings"
    fi

    # Copy web app files
    if [ -d "$APP_DIR" ]; then
        if [ -d "./app" ]; then
            print_info "Web app directory ./app/ already exists, skipping"
            print_info "To update: remove ./app/ and run 'mikrochat init' again"
        else
            cp -r "$APP_DIR" "./app"
            print_success "Web app files copied to ./app/"
            print_info "Point your web server (nginx, caddy, etc.) at this directory"
        fi
    fi

    echo ""
    print_info "Ready! Run 'mikrochat start' to start the API server"
    echo ""
}

mikrochat_start() {
    if [ ! -f "$API_FILE" ]; then
        print_error "MikroChat is not installed. Run 'mikrochat install' first."
        exit 1
    fi

    check_node

    print_info "Starting MikroChat..."
    echo ""

    node "$API_FILE" "$@"
}

mikrochat_upgrade() {
    print_info "Checking for updates..."

    if [ ! -d "$INSTALL_DIR" ]; then
        print_error "MikroChat is not installed. Run 'mikrochat install' first."
        exit 1
    fi

    CURRENT_VERSION=""
    if [ -f "$VERSION_FILE" ]; then
        CURRENT_VERSION=$(cat "$VERSION_FILE" | tr -d '[:space:]')
        print_info "Current version: v$CURRENT_VERSION"
    fi

    # Check latest version from remote
    LATEST_VERSION=""
    if command -v curl &> /dev/null; then
        LATEST_VERSION=$(curl -sSL "$DOWNLOAD_BASE/VERSION" 2>/dev/null | tr -d '[:space:]')
    elif command -v wget &> /dev/null; then
        LATEST_VERSION=$(wget -q -O - "$DOWNLOAD_BASE/VERSION" 2>/dev/null | tr -d '[:space:]')
    fi

    if [ -n "$LATEST_VERSION" ]; then
        print_info "Latest version: v$LATEST_VERSION"

        if [ "$CURRENT_VERSION" = "$LATEST_VERSION" ]; then
            print_success "Already up to date!"
            return
        fi

        print_info "Upgrading to v$LATEST_VERSION..."
    else
        print_info "Could not check remote version, reinstalling latest..."
    fi

    mikrochat_install
}

mikrochat_version() {
    if [ -f "$VERSION_FILE" ]; then
        echo "MikroChat v$(cat "$VERSION_FILE" | tr -d '[:space:]')"
    else
        print_error "MikroChat is not installed"
        exit 1
    fi
}

mikrochat_uninstall() {
    print_info "Uninstalling MikroChat..."

    if [ -d "$INSTALL_DIR" ]; then
        rm -rf "$INSTALL_DIR"
        print_success "MikroChat installation removed"
    else
        print_info "MikroChat installation not found"
    fi

    if [ -f "$HOME/.local/bin/mikrochat" ]; then
        rm "$HOME/.local/bin/mikrochat"
        print_success "MikroChat CLI removed"
    fi

    print_success "MikroChat has been uninstalled"
    echo ""
    print_info "Your mikrochat.config.json and mikrochat_db/ data were not removed"
    print_info "Run 'hash -r' or restart your shell to clear the command cache"
}

mikrochat_docs() {
    DOCS_URL="https://github.com/mikaelvesavuori/mikrochat"

    if command -v xdg-open &> /dev/null; then
        xdg-open "$DOCS_URL"
    elif command -v open &> /dev/null; then
        open "$DOCS_URL"
    elif command -v start &> /dev/null; then
        start "$DOCS_URL"
    else
        echo "Visit: $DOCS_URL"
    fi
}

case "$1" in
    install)
        mikrochat_install
        ;;
    init)
        mikrochat_init
        ;;
    start)
        shift
        mikrochat_start "$@"
        ;;
    upgrade)
        mikrochat_upgrade
        ;;
    version|--version|-v)
        mikrochat_version
        ;;
    uninstall)
        mikrochat_uninstall
        ;;
    docs)
        mikrochat_docs
        ;;
    *)
        echo "MikroChat CLI"
        if [ -f "$VERSION_FILE" ]; then
            echo "Version: v$(cat "$VERSION_FILE" | tr -d '[:space:]')"
        fi
        echo ""
        echo "Usage: mikrochat <command>"
        echo ""
        echo "Commands:"
        echo "  install      Download and install MikroChat"
        echo "  init         Create config file and copy web app to current directory"
        echo "  start        Start the MikroChat API server"
        echo "  upgrade      Upgrade to the latest version"
        echo "  version      Show installed version"
        echo "  uninstall    Remove MikroChat from your system"
        echo "  docs         Open documentation"
        echo ""
        ;;
esac
EOF

    chmod +x "$BIN_DIR/mikrochat"

    print_success "MikroChat CLI installed to $BIN_DIR/mikrochat"
}

# Main
print_info "Installing MikroChat CLI (v$MIKROCHAT_CLI_VERSION)..."
echo ""

create_cli

# Check if ~/.local/bin is in PATH
if [[ ":$PATH:" != *":$BIN_DIR:"* ]]; then
    echo ""
    print_info "Add this to your shell profile (~/.bashrc, ~/.zshrc, etc.):"
    echo ""
    echo "  export PATH=\"\$HOME/.local/bin:\$PATH\""
    echo ""
    print_info "Updating PATH for this session..."
    export PATH="$BIN_DIR:$PATH"
fi

echo ""
print_success "Done!"
echo ""
print_info "Quick start:"
echo ""
echo "  mikrochat install     # Download MikroChat"
echo "  mkdir my-chat && cd my-chat"
echo "  mikrochat init        # Create config + copy web app"
echo "  mikrochat start       # Start the API server"
echo ""
