// Loads in all the app settings into app-settings.json (user settings / preferences)

export async function loadAppSettings() {
    for (const setting of config) {
        await setUserSettingIfNotExist(setting)
    }
}

type Setting = {
    setting: string
    key: string
    value: any
    override?: boolean // If this is true, force it to be set to the config even if it exists
}

const config: Setting[] = [
    {
        setting: 'git',
        key: 'enabled',
        value: true,
    },
    {
        setting: 'git',
        key: 'create-new-branch',
        value: true,
    },
    {
        setting: 'git',
        key: 'merge-use-default-commit-message',
        value: false,
    },
]

async function setUserSettingIfNotExist(data: Setting) {
    // Check if it already exists
    const settingKey = data.setting + '.' + data.key
    const res = await window.api.invoke('has-user-setting', settingKey)
    // If it exists, don't overwrite until override is true
    if (res.data) {
        if (data.override) {
            await window.api.invoke('set-user-setting', data)
        }
        return
    }
    await window.api.invoke('set-user-setting', data)
}

export async function getGitSettings() {
    let versioning_type = 'none'
    let create_new_branch = true
    const res = await window.api.invoke('get-user-setting', 'git.enabled')
    if (res.success) {
        versioning_type = res.data ? 'git' : 'none'
    }
    const res2 = await window.api.invoke(
        'get-user-setting',
        'git.create-new-branch'
    )
    if (res2.success) {
        create_new_branch = res2.data
    }
    return { versioning_type, create_new_branch }
}
