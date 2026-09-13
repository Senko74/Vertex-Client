const WebSockets = require("ws")
const { joinGame } = require("./joinGame")
const { InputSender } = require("./inputSocketSender")
class ConnectionManager
{
    constructor(gameInfo, callback)
    {
        console.log("game infoooo", gameInfo)
        this.gameId = gameInfo.gameId
        this.wsUrl = gameInfo.wsUrl
        this.mode = gameInfo.mode
        this.callback = callback
        this.socket
        this.inputSender 
        this.createSocket()
    }

    createSocket()
    {
        this.socket = new WebSockets(
            this.wsUrl,
            {
                headers : 
                {
                    Origin : "https:/:starblast.io"
                }
            }
        )
        this.socket.on("open", () =>
        {
            console.log("open")
            this.inputSender = new InputSender(this.socket)
            joinGame(
                {
                    gameId : this.gameId,
                    mode : this.mode
                },
                this.socket,
                (message) =>
                {
                    this.callback(message)
                }
            )
        })

        this.socket.on("message", (message) =>
        {
            this.callback(message)
        })

        this.socket.on("close",(code) =>
        {
            console.log("closed", code)
        })
    }

    input(key)
    {
        if(this.socket)
        {
            this.inputSender.input(key)
        }
    }
}

module.exports = { ConnectionManager }