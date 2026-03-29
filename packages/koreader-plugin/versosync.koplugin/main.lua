local WidgetContainer = require("ui/widget/container/widgetcontainer")
local UIManager = require("ui/uimanager")
local InfoMessage = require("ui/widget/infomessage")
local MultiInputDialog = require("ui/widget/multiinputdialog")
local InputDialog = require("ui/widget/inputdialog")
local NetworkMgr = require("ui/network/manager")
local Dispatcher = require("dispatcher")
local _ = require("gettext")
local T = require("ffi/util").template

local VersoSyncSettings = require("settings")
local VersoSyncUpload = require("upload")
local VersoSyncConst = require("const")

local VersoSync = WidgetContainer:extend{
    name = "versosync",
    is_doc_only = false,
}

function VersoSync:init()
    self.ui.menu:registerToMainMenu(self)
    Dispatcher:registerAction("versosync_full_sync", {
        category = "none",
        event = "VersoSyncFullSync",
        title = _("Verso Sync: synchronize all data"),
        general = true,
    })
end

function VersoSync:onDispatcherRegisterActions()
    Dispatcher:registerAction("versosync_full_sync", {
        category = "none",
        event = "VersoSyncFullSync",
        title = _("Verso Sync: synchronize all data"),
        general = true,
    })
end

function VersoSync:onVersoSyncFullSync()
    self:performFullSync()
end

function VersoSync:addToMainMenu(menu_items)
    menu_items.versosync = {
        text = _("Verso Sync"),
        sorting_hint = "tools",
        sub_item_table = {
            {
                text = _("Synchronize data"),
                keep_menu_open = true,
                callback = function()
                    self:performFullSync()
                end,
            },
            {
                text = _("Sync on suspend"),
                checked_func = function()
                    return VersoSyncSettings:get("sync_on_suspend")
                end,
                callback = function()
                    VersoSyncSettings:set("sync_on_suspend",
                        not VersoSyncSettings:get("sync_on_suspend"))
                end,
            },
            {
                text = _("Set server URL"),
                keep_menu_open = true,
                callback = function()
                    self:showServerUrlDialog()
                end,
            },
            {
                text = _("Set credentials"),
                keep_menu_open = true,
                callback = function()
                    self:showCredentialsDialog()
                end,
            },
            {
                text = _("About"),
                keep_menu_open = true,
                callback = function()
                    UIManager:show(InfoMessage:new{
                        text = T(_("Verso Sync plugin v%1\n\nSyncs reading statistics and annotations to your Verso server."), VersoSyncConst.VERSION),
                    })
                end,
            },
        },
    }
end

function VersoSync:showServerUrlDialog()
    local dialog
    dialog = InputDialog:new{
        title = _("Verso server URL"),
        input = VersoSyncSettings:getServerUrl(),
        input_hint = "https://verso.example.com",
        buttons = {{
            {
                text = _("Cancel"),
                id = "close",
                callback = function()
                    UIManager:close(dialog)
                end,
            },
            {
                text = _("Apply"),
                is_enter_default = true,
                callback = function()
                    local url = dialog:getInputText()
                    url = url:gsub("/+$", "")
                    VersoSyncSettings:set("server_url", url)
                    UIManager:close(dialog)
                end,
            },
        }},
    }
    UIManager:show(dialog)
end

function VersoSync:showCredentialsDialog()
    local dialog
    dialog = MultiInputDialog:new{
        title = _("Verso credentials"),
        fields = {
            {
                text = VersoSyncSettings:getEmail(),
                hint = _("Email"),
            },
            {
                text = VersoSyncSettings:getPassword(),
                hint = _("App password"),
                text_type = "password",
            },
        },
        buttons = {{
            {
                text = _("Cancel"),
                id = "close",
                callback = function()
                    UIManager:close(dialog)
                end,
            },
            {
                text = _("Apply"),
                is_enter_default = true,
                callback = function()
                    local fields = dialog:getFields()
                    VersoSyncSettings:set("email", fields[1])
                    VersoSyncSettings:set("password", fields[2])
                    UIManager:close(dialog)
                end,
            },
        }},
    }
    UIManager:show(dialog)
end

function VersoSync:performFullSync()
    if not VersoSyncSettings:isConfigured() then
        UIManager:show(InfoMessage:new{
            text = _("Please configure server URL and credentials first."),
        })
        return
    end

    local server_url = VersoSyncSettings:getServerUrl()

    NetworkMgr:runWhenOnline(function()
        UIManager:show(InfoMessage:new{
            text = _("Syncing..."),
            timeout = 1,
        })

        local ok = VersoSyncUpload.syncAllBooks(server_url, function(current, total, title)
            -- Progress callback
        end)

        if ok then
            UIManager:show(InfoMessage:new{
                text = _("Sync complete!"),
                timeout = 2,
            })
        else
            UIManager:show(InfoMessage:new{
                text = _("Sync failed. Check server URL and credentials."),
            })
        end
    end)
end

function VersoSync:onSuspend()
    if VersoSyncSettings:get("sync_on_suspend") and VersoSyncSettings:isConfigured() then
        local server_url = VersoSyncSettings:getServerUrl()
        VersoSyncUpload.syncCurrentBook(server_url, true)
    end
end

function VersoSync:onPowerOff()
    self:onSuspend()
end

function VersoSync:onReboot()
    self:onSuspend()
end

return VersoSync
