#!/bin/bash

# Install the UI
cd electron
yarn install 


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
pipx install theseus_agent 

if ! command -v theseus_agent --help &> /dev/null
then
    echo "theseus Backend is not installed. Please install it manually by running 'pipx install theseus_agent'"
    exit 1
fi

echo "theseus Backend is installed successfully."


yarn start
