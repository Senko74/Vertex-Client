const { gameInformation } = require("../GameInformations/gameInformation")
const { WebSocketServer } = require("ws")
const { ConnectionManager } = require("./WebSocket Manager/connectionManager")
const port = 9000

const server = new WebSocketServer(
    {
        port : port
    }
)

let connectionManager

server.on("connection", async (socket) =>
{
    console.log("connection")
    socket.on("message", async (message) =>
    {
        let msg
        try
        {
            msg = JSON.parse(message)
        }
        catch(err) 
        {
            return
        }
        if(msg.name)
        {
            switch(msg.name)
            {
                case "get_game_info":
                    console.log("game info:" , msg)
                    const gameInfo = await gameInformation(msg.data.gameLink)
                    console.log(gameInfo)
                    socket.send(JSON.stringify(
                        {
                            name : "start_game",
                            data : gameInfo
                        }
                    ))
                    break
                case "start_game":
                    console.log("msg data", msg)
                    connectionManager = new ConnectionManager(
                        {
                            gameId : msg.data.gameId,
                            wsUrl : msg.data.wsUrl
                        },
                        (message) =>
                        {
                            console.log(Array.from(message))
                            socket.send(message)
                        }
                    )
                    break
                case "thrust":
                    if(connectionManager)
                    {
                        connectionManager.input("thrust")
                        console.log("thrust")
                    }
                    break

                case "shoot":
                    if(connectionManager)
                    {
                        connectionManager.input("shoot")
                        console.log("thrust")
                    }
                    break
                case "stop_thrust":
                    if(connectionManager)
                    {
                        connectionManager.input("stop_thrust")
                    }
                    break
                
                case "stop_shoot":
                    if(connectionManager)
                    {
                        connectionManager.input("stop_shoot")
                    }
                    break

            }
        }
    })
})