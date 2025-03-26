#!/usr/bin/env bash

# check if python3  is installed
if ! command -v python3 &> /dev/null
then
    echo "Python3 is not installed. Please install it first."
    exit 1
fi

# check if node is installed
if ! command -v node &> /dev/null
then
    echo "node is not installed. Please install it first."
    exit 1
fi

# check if npm is installed
if ! command -v npm &> /dev/null
then
    echo "npm is not installed. Please install it first."
    exit 1
fi

# check if pip3 is installed
if ! command -v pip3 &> /dev/null
then
    echo "Pip3 is not installed. Please install it first."
    exit 1
fi


# check if pipx is installed
if ! command -v pipx &> /dev/null
then
    # if OS is macOS, use brew to install pipx
    if [ "$(uname)" == "Darwin" ]; then
        echo "Pipx is not installed. Installing it using brew..."
        brew install pipx
    else
        echo "Pipx is not installed. Please install it first. Installation instructions: https://pipx.pypa.io/stable/installation/"
        exit 1
    fi
fi

echo "Installing theseus backend..."
pipx install --force theseus_agent 

if ! command -v theseus_agent --help &> /dev/null
then
    echo "theseus Backend is not installed. Please install it manually by running 'pipx install --force theseus_agent'"
    exit 1
fi

echo "theseus Backend is installed successfully."

echo "Installing theseus TUI..."

# Check if theseus-tui npm package exists
if npm list -g theseus-tui@latest &> /dev/null
then
    echo "theseus-tui package is already installed."
    npm uninstall -g theseus-tui
    echo "theseus-tui package is uninstalled."
else
    echo "theseus-tui package is not installed. Installing now..."
fi

npm install -g theseus-tui@latest 
# check if theseus-tui is installed
if ! command -v theseus-tui &> /dev/null
then
    echo "theseus TUI is not installed. Please install it manually by running 'npm install -g theseus-tui' or 'sudo npm install -g theseus-tui'."
    exit 1
fi

if npm list -g theseus-ui@latest &> /dev/null
then
    echo "theseus UI is already installed. Uninstalling it..."
    npm uninstall -g theseus-ui
    echo "theseus UI is uninstalled."
fi

echo "Installing theseus UI..."
npm install -g theseus-ui@latest
if ! command -v theseus-ui &> /dev/null
then
    echo "theseus UI is not installed. Please install it manually by running 'npm install -g theseus-ui' or 'sudo npm install -g theseus-ui'."
    exit 1
fi


echo "theseus TUI is installed successfully."
echo "theseus is installed successfully."
echo "Run 'theseus-tui' to start the theseus TUI."
echo "Run 'theseus-ui' to start the theseus UI."
