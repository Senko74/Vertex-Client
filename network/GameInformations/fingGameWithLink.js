const { buildWsUrl } = require("./buildWsUrl")
async function fingGameWithLink(gameLink)
{
    if(gameLink.includes("@"))
    {
        return moddedCustomParty(gameLink)
    }
    else
    {
        return vanillaCustomParty(gameLink)
    }
}

function moddedCustomParty(gameLink)
{
    let wsServerUrl = ""
    let gameId = ""
    if(gameLink.includes("@"))
    {
        serverIp = gameLink.split("@")[1]
        wsServerUrl = buildWsUrl(serverIp)
        gameId = `${gameLink.split("@")[0]}`
        gameId = gameId.split("#")[1]

    }
    return{
        id : parseInt(gameId),
        wsUrl : wsServerUrl
    }
    

    return null
}

async function vanillaCustomParty(gameLink)
{
    let wsServerUrl = ""
    let gameId = gameLink.split("#")[1]
    const res = await fetch("https://starblast.io/simstatus.json")
    const serverData = await res.json()
    
    for(server of serverData)
    {
        if(server.systems !== 0)
        {
            for(game of server.systems)
            {
                if(gameId === (game.id).toString())
                {
                    return{
                        id : game.id,
                        mode : game.mode,
                        wsUrl : buildWsUrl(server.address)
                    }
                }
            }
        }
    }
    return null
}

module.exports = { fingGameWithLink }