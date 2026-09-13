
function joinGame(info, socket, callback)
{
    if(socket)
    {
        console.log(info)
        socket.send(JSON.stringify(
            {
                name : "ojct:4",
                data : 
                {
                    player_name : "Vertex Client",
                    preferred : info.gameId,
                    spectate : false,
                    mode : info.mode,
                    ecpKey : "07b59-c621c",
                    ecp_custom : 
                    {
                        badge : "youtube",
                        finish : "carbon",
                        hue : 276,
                        laser : 3
                    }
                }
            }
        ))

        socket.on("message", onMessage)

        function onMessage(message)
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
                    case "welcome":
                        socket.send(JSON.stringify(
                            {
                                name : "enter",
                                data : 
                                {
                                    spectate : false
                                }
                            }
                        ))
                        socket.send(JSON.stringify(
                            {
                                name : "respawn"
                            }
                        ))
                        break
                    case "entered":
                        console.log("entered")
                        const buffer = new ArrayBuffer(2)
                        const view = new DataView(buffer)
                        view.setUint8(0, 67)
                        view.setUint8(1, msg.data.shipid)
                        callback(buffer)
                        socket.send(0)
                        socket.off("message", onMessage)
                        break
                }
            }
        }
    }
}

module.exports = { joinGame }