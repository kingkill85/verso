local socketutil = require("socketutil")
local http = require("socket.http")
local ltn12 = require("ltn12")
local rapidjson = require("rapidjson")
local logger = require("logger")

local function base64_encode(data)
    local b = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
    return ((data:gsub(".", function(x)
        local r, b_val = "", x:byte()
        for i = 8, 1, -1 do r = r .. (b_val % 2^i - b_val % 2^(i-1) > 0 and "1" or "0") end
        return r
    end) .. "0000"):gsub("%d%d%d?%d?%d?%d?", function(x)
        if (#x < 6) then return "" end
        local c = 0
        for i = 1, 6 do c = c + (x:sub(i, i) == "1" and 2^(6-i) or 0) end
        return b:sub(c+1, c+1)
    end) .. ({ "", "==", "=" })[#data % 3 + 1])
end

local function callApi(method, url, headers, body, email, password)
    headers = headers or {}
    headers["Content-Type"] = "application/json"

    if email and password then
        headers["Authorization"] = "Basic " .. base64_encode(email .. ":" .. password)
    end

    local json_body = body and rapidjson.encode(body) or nil
    if json_body then
        headers["Content-Length"] = #json_body
    end

    local sink = {}
    socketutil:set_timeout(socketutil.LARGE_BLOCK_TIMEOUT, socketutil.LARGE_TOTAL_TIMEOUT)
    local request = {
        url = url,
        method = method,
        headers = headers,
        sink = ltn12.sink.table(sink),
    }
    if json_body then
        request.source = ltn12.source.string(json_body)
    end

    local code = socket.skip(1, http.request(request))
    socketutil:reset_timeout()

    if code == 200 then
        local response = table.concat(sink)
        if response ~= "" and response:sub(1, 1) == "{" then
            return true, rapidjson.decode(response)
        end
        return true, {}
    else
        logger.warn("Verso Sync API error:", code)
        return false, "HTTP " .. tostring(code)
    end
end

return callApi
