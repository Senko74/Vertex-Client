
function joinGame(info, socket)
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
                        socket.off("message", onMessage)
                }
            }
        }
    }
}

module.exports = { joinGame }