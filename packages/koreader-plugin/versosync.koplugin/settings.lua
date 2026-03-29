local DataStorage = require("datastorage")
local LuaSettings = require("luasettings")

local VersoSyncSettings = {}

local settings_file = DataStorage:getSettingsDir() .. "/versosync.lua"
local settings = LuaSettings:open(settings_file)

local DEFAULTS = {
    server_url = "",
    email = "",
    password = "",
    sync_on_suspend = true,
}

function VersoSyncSettings:get(key)
    local all = settings:readSetting("versosync") or {}
    if all[key] ~= nil then
        return all[key]
    end
    return DEFAULTS[key]
end

function VersoSyncSettings:set(key, value)
    local all = settings:readSetting("versosync") or {}
    all[key] = value
    settings:saveSetting("versosync", all)
    settings:flush()
end

function VersoSyncSettings:getServerUrl()
    return self:get("server_url")
end

function VersoSyncSettings:getEmail()
    return self:get("email")
end

function VersoSyncSettings:getPassword()
    return self:get("password")
end

function VersoSyncSettings:isConfigured()
    local url = self:getServerUrl()
    local email = self:getEmail()
    local password = self:getPassword()
    return url ~= "" and email ~= "" and password ~= ""
end

return VersoSyncSettings
