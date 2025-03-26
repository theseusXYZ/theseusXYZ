/* eslint-disable import/no-named-as-default-member */
import {
    app,
    BrowserWindow,
    dialog,
    globalShortcut,
    ipcMain,
    safeStorage,
    shell,
} from 'electron'
import path from 'path'
import { ChildProcess, spawn, spawnSync } from 'child_process'
import portfinder from 'portfinder'
import fs from 'fs'
import semver from 'semver'
import './plugins/editor'
import axios from 'axios'

const DEV_MODE = process.env.DEV_MODE ?? false

const winston = require('winston')

const userDataPath = app.getPath('userData')
const logDir = path.join(userDataPath, 'logs')

// Ensure log directory exists
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true })
}

function showErrorDialog(title: string, details?: string): Promise<number> {
    return new Promise(resolve => {
        if (app.isReady()) {
            const windowToUse = new BrowserWindow({
                width: 400,
                height: 300,
                show: false,
                alwaysOnTop: true,
                webPreferences: {
                    nodeIntegration: false,
                    contextIsolation: true,
                },
            })

            dialog
                .showMessageBox(windowToUse, {
                    type: 'error',
                    message: title ?? 'Uncaught Exception:',
                    detail: details,
                    buttons: ['View Logs', 'Close'],
                    noLink: true,
                })
                .then(result => {
                    resolve(result.response)
                    if (result.response === 1) {
                        // Only close the window if 'Close' was clicked
                        windowToUse.close()
                    } else if (result.response === 0) {
                        shell.openPath(logDir)
                    }
                })

            windowToUse.show()
        } else {
            console.error(
                'Cannot show error dialog before app is ready:',
                title,
                details
            )
            mainLogger.error(
                `Error occurred before app was ready: ${title}\n${details}`
            )
            app.on('ready', async () => {
                const response = await showErrorDialog(title, details)
                resolve(response)
            })
        }
    })
}

const createLogger = (service: string) => {
    return winston.createLogger({
        // level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
        level: 'debug',
        format: winston.format.combine(
            winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
            winston.format.errors({ stack: true }),
            winston.format.printf(
                ({
                    level,
                    message,
                    timestamp,
                    service,
                }: {
                    level: string
                    message: string
                    timestamp: string
                    service: string
                }) => {
                    return `${timestamp} [${service}] ${level}: ${message}`
                }
            )
        ),
        defaultMeta: { service },
        transports: [
            new winston.transports.File({
                filename: path.join(logDir, 'error.log'),
                level: 'error',
            }),
            new winston.transports.File({
                filename: path.join(logDir, 'theseus.log'),
            }),
        ],
    })
}

const BACKEND_MINIMUM_VERSION = '0.1.25'

function checkBackendExists(): { passed: boolean; message?: string } {
    try {
        const result = spawnSync('theseus_agent', ['--version'])
        if (result.error) {
            mainLogger.error(
                `Error checking theseus_agent version: ${result.stderr.toString()}`
            )
            mainLogger.error(
                `Error checking theseus_agent version: ${JSON.stringify(
                    result
                ).toString()}`
            )
            throw result.error
        }

        const versionOutput = result.stdout.toString().trim()
        const versionMatch = versionOutput.match(/(\d+\.\d+\.\d+)/)
        if (!versionMatch) {
            mainLogger.error(
                `theseus_agent version not found or not parsable. ${
                    versionOutput
                        ? 'Found ' + versionOutput
                        : '(No version found)'
                }\n${result?.output?.toString()}`
            )
            return {
                passed: false,
                message:
                    'theseus_agent version not found or not parseable. Please check your installation.',
            }
        }

        const version = versionMatch[1]

        if (!semver.valid(version)) {
            mainLogger.warn(`Invalid theseus_agent version: ${version}`)
            return {
                passed: false,
                message: `Invalid theseus_agent version: ${version}. Please check your installation.`,
            }
        }

        if (semver.lt(version, BACKEND_MINIMUM_VERSION)) {
            mainLogger.warn(
                `theseus_agent version ${version} is below the minimum required version ${BACKEND_MINIMUM_VERSION}`
            )
            return {
                passed: false,
                message: `theseus_agent version ${version} is below the minimum required version ${BACKEND_MINIMUM_VERSION}. Please update theseus_agent.`,
            }
        }

        // mainLogger.info(
        //     `theseus_agent v${version} found and meets minimum version requirement.`
        // )
        mainLogger.info(`theseus_agent v${version}`)
        return { passed: true }
    } catch (error) {
        mainLogger.error('Failed to get theseus_agent version:', error)
        return {
            passed: false,
            message:
                'Failed to get theseus_agent version. Please make sure theseus_agent is installed and accessible.',
        }
    }
}

async function performInitialChecks(): Promise<boolean> {
    const backendCheck = checkBackendExists()
    if (!backendCheck.passed) {
        const response = await showErrorDialog(
            'theseus_agent check failed',
            backendCheck.message ||
                'Unknown error occurred while checking theseus_agent.'
        )
        if (response === 1) {
            // User clicked 'Close'
            return false
        }
        // If user clicked 'View Logs', the function will have already opened the logs
        // and the dialog will remain open, so we return false to prevent app startup
        return false
    }
    return true // Checks passed
}

const mainLogger = createLogger('theseus')
const serverLogger = createLogger('theseus-agent')
const rendererLogger = createLogger('theseus-ui')

const appVersion = app.getVersion()
mainLogger.info('Application started.')
mainLogger.info(
    `theseus-ui ${appVersion ? 'v' + appVersion : '(version not found)'}`
)

function clearLogFiles() {
    const logFiles = ['error.log', 'theseus.log']
    logFiles.forEach(file => {
        const logPath = path.join(logDir, file)
        fs.writeFileSync(logPath, '', { flag: 'w' })
    })
    // mainLogger.info('Log files cleared on startup.')
}

// if (process.env.NODE_ENV !== 'production') {
mainLogger.add(new winston.transports.Console())
serverLogger.add(new winston.transports.Console())
// }

// if (process.env.NODE_ENV !== 'production') {
mainLogger.add(
    new winston.transports.Console({
        format: winston.format.simple(),
    })
)
// }

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
    app.quit()
}

let serverProcess: ChildProcess
portfinder.setBasePort(10000)
let use_port = NaN

process.on('uncaughtException', error => {
    const detailedError = `
${error.message}
${error.stack}
${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}
`.trim()

    mainLogger.error(`Uncaught Exception in main process: ${detailedError}`)

    showErrorDialog(`Exception: ${error.message}`, error.stack)
})

async function setupServer(): Promise<{ success: boolean; message?: string }> {
    const db_path = path.join(app.getPath('userData'))

    try {
        const port = await portfinder.getPortPromise()
        use_port = port

        serverProcess = spawn(
            'theseus_agent',
            ['server', '--port', port.toString(), '--db_path', db_path],
            { signal: controller.signal }
        )

        serverProcess.stdout?.on('data', (data: Buffer) => {
            const message = data.toString().trim()
            if (message.startsWith('INFO:')) {
                serverLogger.info(message.substring(5).trim())
            } else {
                serverLogger.info(message)
            }
        })

        serverProcess.stderr?.on('data', (data: Buffer) => {
            const message = data.toString().trim()
            if (message.startsWith('INFO:')) {
                serverLogger.info(message.substring(5).trim())
            } else {
                serverLogger.error(message)
                // Assuming mainWindow is your BrowserWindow instance
                mainWindow?.webContents.send('server-error', message)
            }
        })

        serverProcess.on('close', (code: number | null) => {
            mainLogger.info(`Server process exited with code ${code}`)
        })

        return { success: true }
    } catch (error) {
        mainLogger.error('Failed to setup server:', error)
        return { success: false, message: 'Failed to setup server.' }
    }
}

let mainWindow: BrowserWindow | null = null

function createOrShowWindow() {
    if (mainWindow === null) {
        mainWindow = new BrowserWindow({
            show: false,
            titleBarStyle: 'hidden',
            backgroundColor: '#16161c',
            trafficLightPosition: { x: 15, y: 10 },
            webPreferences: {
                preload: path.join(__dirname, 'preload.js'),
                contextIsolation: true,
                nodeIntegration: false,
                additionalArguments: [`--port=${use_port}`],
            },
        })
        mainWindow.maximize()
        mainWindow.show()
        if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
            mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL)
        } else {
            mainWindow.loadFile(
                path.join(
                    __dirname,
                    `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`
                )
            )
        }

        mainWindow.setMenu(null)

        mainWindow.on('closed', () => {
            mainWindow = null
        })
    } else {
        if (mainWindow.isMinimized()) mainWindow.restore()
        mainWindow.focus()
    }
}

const controller = new AbortController()

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', async () => {
    clearLogFiles()

    const checksPass = await performInitialChecks()
    if (!checksPass) {
        mainLogger.error('Some checks failed. Exiting.')
        app.quit()
        return
    }

    if (safeStorage.isEncryptionAvailable()) {
        mainLogger.info('Encryption is available and can be used.')
    } else {
        mainLogger.warn(
            'Encryption is not available. Fallback mechanisms might be required.'
        )
    }

    mainLogger.info('Application is ready. Spawning app window.')
    await setupServer()
    createOrShowWindow()
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.

let asyncOperationDone = false

async function asyncOperation() {
    await axios.get(`http://localhost:${use_port}/sessions/UI/teardown`)
    await new Promise(resolve => setTimeout(resolve, 2000))
    console.log("async complete")
}

app.on('window-all-closed', async (e: { preventDefault: () => void }) => {
    mainLogger.info('All windows closed. Quitting application.')

    if (!asyncOperationDone) {
        e.preventDefault()
        await asyncOperation()
        asyncOperationDone = true
        console.log('async operation done, quitting')
        serverProcess.kill('SIGINT')
        mainLogger.info('Killing server process withpid:' + serverProcess.pid)
        app.quit()
    }
})

// app.on('window-all-closed', async () => {
//     mainLogger.info('All windows closed. Quitting application.')
//     // if (process.platform !== 'darwin') {
//     serverProcess.kill('SIGINT')
//     mainLogger.info('Killing server process withpid:'+ serverProcess.pid)
//     await new Promise(resolve => setTimeout(resolve, 2000))
//     app.quit()
//     // }
// })

app.on('browser-window-focus', function () {
    if (!DEV_MODE) {
        globalShortcut.register('CommandOrControl+R', () => {
            console.log('CommandOrControl+R is pressed: Shortcut Disabled')
            mainLogger.debug('CommandOrControl+R is pressed: Shortcut Disabled')
        })
        globalShortcut.register('F5', () => {
            console.log('F5 is pressed: Shortcut Disabled')
            mainLogger.debug('F5 is pressed: Shortcut Disabled')
        })
    }
})

app.on('browser-window-blur', function () {
    globalShortcut.unregister('CommandOrControl+R')
    globalShortcut.unregister('F5')
})

app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        const checksPass = await performInitialChecks()
        if (checksPass) {
            createOrShowWindow()
        } else {
            app.quit()
        }
    } else {
        createOrShowWindow()
    }
})
// app.on('window-all-closed', () => {
//     if (process.platform !== 'darwin') {
//         app.quit()
//     }
// })

app.on('before-quit', () => {
    if (!serverProcess) {
        mainLogger.info('No server process found. Quitting application.')
        return
    }

    mainLogger.info(
        'Killing server process with        pid:',
        serverProcess.pid
    )
    // if (serverProcess.pid) {
    //     mainLogger.info(
    //         'Killing server process with       pid:',
    //         serverProcess.pid
    //     )
    //     process.kill(serverProcess.pid, 'SIGTERM')
    // }
    serverProcess.kill(9) // Make sure to kill the server process when the app is closing

    if (serverProcess.killed) {
        mainLogger.info('Server process was successfully killed.')
    } else {
        mainLogger.warn('Failed to kill the server process.')
    }
})

/*
 * ======================================================================================
 *                                IPC Main Events
 * ======================================================================================
 */

ipcMain.handle('ping', () => {
    console.log('PONG!')
    return 'pong'
})

ipcMain.on('log-error', (event, error) => {
    rendererLogger.error(error)
})

ipcMain.handle('open-logs-directory', () => {
    shell.openPath(logDir)
})

ipcMain.on('get-port', event => {
    event.reply('get-port-response', use_port)
})

ipcMain.on('get-file-path', event => {
    dialog
        .showOpenDialog({
            properties: ['openDirectory', 'createDirectory'],
        })
        .then(result => {
            if (!result.canceled && result.filePaths.length > 0) {
                event.reply('file-path-response', result.filePaths[0])
            } else {
                event.reply('file-path-response', 'cancelled')
            }
        })
        .catch(err => {
            mainLogger.error(
                '(IPC Event get-file-path) Failed to open dialog:',
                err
            )
            event.reply('file-path-response', 'error')
        })
})

// IPC handlers for encrypting and decrypting data
ipcMain.handle('encrypt-data', async (event, plainText) => {
    try {
        const encrypted = safeStorage.encryptString(plainText)
        return encrypted.toString('hex') // send as string to render process
    } catch (error) {
        mainLogger.error(
            '(IPC Event encrypt-data) Failed to encrypt data:',
            error
        )
        throw error
    }
})

ipcMain.handle('decrypt-data', async (event, encryptedHex) => {
    try {
        const encryptedBuffer = Buffer.from(encryptedHex, 'hex')
        const decrypted = safeStorage.decryptString(encryptedBuffer)
        return decrypted
    } catch (error) {
        mainLogger.error(
            '(IPC Event decrypt-data) Failed to decrypt data:',
            error
        )
        throw error
    }
})

ipcMain.handle('save-data', async (event, plainText) => {
    if (safeStorage.isEncryptionAvailable()) {
        const encrypted = safeStorage.encryptString(plainText)
        const filePath = path.join(app.getPath('userData'), 'secureData.bin')
        if (!fs.existsSync(filePath)) {
            fs.writeFileSync(filePath, '')
        }
        try {
            fs.writeFileSync(filePath, encrypted)
            return { success: true }
        } catch (error) {
            mainLogger.error(
                '(IPC Event save-data) Failed to save encrypted data:',
                error
            )
            return { success: false, message: 'Failed to save encrypted data' }
        }
    } else {
        return { success: false, message: 'Encryption not available' }
    }
})

ipcMain.handle('load-data', async () => {
    const filePath = path.join(app.getPath('userData'), 'secureData.bin')
    if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, '')
    }
    try {
        const encryptedData = fs.readFileSync(filePath)
        if (safeStorage.isEncryptionAvailable()) {
            const decrypted = safeStorage.decryptString(encryptedData)
            return { success: true, data: decrypted }
        } else {
            return { success: false, message: 'Decryption not available' }
        }
    } catch (error) {
        mainLogger.error(
            '(IPC Event load-data) Failed to read encrypted data:',
            error
        )
        return { success: false, message: 'Failed to read encrypted data' }
    }
})

ipcMain.handle('check-has-encrypted-data', async () => {
    const filePath = path.join(app.getPath('userData'), 'secureData.bin')
    try {
        await fs.promises.access(filePath, fs.constants.F_OK)
        if (safeStorage.isEncryptionAvailable()) {
            return { success: true }
        } else {
            return { success: false, message: 'Data not available' }
        }
    } catch (error) {
        // This just means the file doesn't exist
        // logger.error('(IPC Event check-has-encrypted-data) Failed to get encrypted data:', error)
        return { success: false, message: 'Failed to get encrypted data' }
    }
})

ipcMain.handle('delete-encrypted-data', async () => {
    const filePath = path.join(app.getPath('userData'), 'secureData.bin')
    try {
        // Check if file exists before attempting to delete
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath) // Delete the file
            return {
                success: true,
                message: 'Encrypted data deleted successfully.',
            }
        } else {
            return { success: false, message: 'File does not exist.' }
        }
    } catch (error) {
        mainLogger.error(
            '(IPC Event delete-encrypted-data) Failed to delete encrypted data:',
            error
        )
        return { success: false, message: 'Failed to delete encrypted data.' }
    }
})

const settings = require('electron-settings')
settings.configure({
    fileName: 'app-settings.json',
    prettify: true,
})

ipcMain.handle('get-user-setting', async (event, key) => {
    try {
        const res = await settings.get(key)
        // Handle convert string booleans back into literals
        if (res === 'true') {
            return { success: true, data: true }
        }
        if (res === 'false') {
            return { success: true, data: false }
        }
        return { success: true, data: res }
    } catch (error) {
        mainLogger.error(
            '(IPC Event get-user-setting) Failed to get user settings:',
            error
        )
        return { success: false, message: 'Failed to get user settings' }
    }
})

ipcMain.handle('set-user-setting', async (event, setting) => {
    try {
        // Get existing settings and add to new
        const res = await settings.get(setting.setting)
        const existing = res ?? {}
        if (setting.key) {
            await settings.set(setting.setting, {
                ...existing,
                [setting.key]: setting.value.toString(),
            })
        } else if (Array.isArray(setting.value)) {
            // Replace the entire array if setting.value is an array
            await settings.set(setting.setting, setting.value)
        } else {
            // Append to existing array if setting.value is not an array
            if (!res) {
                await settings.set(setting.setting, [setting.value])
            }
            await settings.set(setting.setting, [...existing, setting.value])
        }
        return { success: true }
    } catch (error) {
        mainLogger.error(
            '(IPC Event set-user-setting) Failed to set user settings:',
            error
        )
        return { success: false, message: 'Failed to set user settings' }
    }
})

ipcMain.handle('has-user-setting', async (event, key) => {
    try {
        const res = await settings.get(key)
        return { success: true, data: res }
    } catch (error) {
        mainLogger.error(
            '(IPC Event has-user-setting) Failed to check if user settings exist:',
            error
        )
        return {
            success: false,
            message: 'Failed to check if user settings exist',
        }
    }
})
