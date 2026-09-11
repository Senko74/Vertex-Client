const WebSockets = require("ws")
const { buildWsUrl } = require("./buildWsUrl")

async function getGameWithMode(mode)
{
    const res = await fetch("https://starblast.io/simstatus.json")
    const serverData = await res.json()
    const server = await getBestServer(serverData)
    for(serv of serverData)
    {
        if(serv.address === server.ip && serv.systems.length !== 0)
        {
            for(game of serv.systems)
            {
                if(game.mode === mode)
                {
                    return {
                        wsUrl : server.wsUrl,
                        gameId : game.id,
                        mode : game.mode
                    }
                }
            }
        }
    }
}
async function getBestServer(serverData)
{
    let servers = []
    for(server of serverData)
    {
        if(server.systems.length !== 0)
        {
            servers.push(await pingServer(server))
        }
    }
    
    const bestServer = getLessPingServer(servers)
    return servers[bestServer]
}

function getLessPingServer(serversData)
{
    let indexMinimum = 0
    for(let i = 0; i < serversData.length ; i++)
    {
        if(serversData[indexMinimum].ping > serversData[i].ping)
        {
            indexMinimum = i
        }
    }
    return indexMinimum
}

function pingServer(server)
{
    return new Promise((resolve,reject) =>
    {
        let dateSend = 0
        let dateReceived = 0
        const wsUrl = buildWsUrl(`${server.address}`)
        const socket = new WebSockets(
            wsUrl,
            {
                headers : 
                {
                    Origin : "starblast.io"
                }
            }
        )
        socket.on("open", () => 
        {
            dateSend = Date.now()
            socket.send("ping")
        })
        socket.on("message", (message) =>
        {
            if(message.toString() === "pong")
            {
                dateReceived = Date.now()
                socket.close()
                resolve({
                    ip : server.address,
                    wsUrl : wsUrl,
                    ping : dateReceived - dateSend
                    })
            }
        })
    }) 
}

module.exports = { getGameWithMode }