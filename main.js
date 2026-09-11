import { init, changeChipColor } from "./rendering/lobby/backgroundLobby";
// import { gameInformation } from "./GameInformations/gameInformation.js"

const inputs = 
{
    thrust : ["w", "z", "ArrowUp"],
    shoot : [" "]
}

const colorInput = document.querySelector("#color")
const playButton = document.querySelector("#play")
const gameLink = document.querySelector("#gamelink")

//LOCAL WS SERVER TO EXE NODE JS 
const socket = new WebSocket("http://localhost:9000")

socket.addEventListener("message", (message) =>
{
    let msg
    try
    {
        msg = JSON.parse(message.data)
    }
    catch(err)
    {
        return
    }
    if(msg.name)
    {
        switch(msg.name)
        {
            case "start_game":
                startGame(msg.data)
        }
    }
})

colorInput.addEventListener("input", (event) =>
{
    changeChipColor(parseInt(colorInput.value.slice(1), 16)%360)
})

playButton.addEventListener("click", () =>
{
    play()
})

function play()
{
    getGameInfo()
}

function getGameInfo()
{
    if(socket)
    {
        const link = gameLink.value
        socket.send(JSON.stringify(
            {
                name : "get_game_info",
                data : 
                {
                    gameLink : link
                }
            }
        ))
    }
}

function startGame(gameInfo)
{
    socket.send(JSON.stringify(
        {
            name : "start_game",
            data : 
            {
                wsUrl : gameInfo.wsUrl,
                gameId : gameInfo.id,
                mode : gameInfo.mode
            }
        }
    ))
}

window.addEventListener("keydown", (event) =>
{
    keyDownInputManager(event)
    console.log(event.key)
})

window.addEventListener("keyup", (event) =>
{
    keyUpInputManager(event)
    console.log("keyup :", event.key)
})

function keyDownInputManager(event)
{
    for(const thrustInput of inputs.thrust)
    {
        if(event.key === thrustInput)
        {
            if(socket)
            {
                socket.send(JSON.stringify(
                    {
                        name : "thrust"
                    }
                ))
            }
        }
    }
    for(const shootInput of inputs.shoot)
    {
        if(event.key === shootInput)
        {
            if(socket)
            {
                socket.send(JSON.stringify(
                    {
                        name : "shoot"
                    }
                ))
            }
        }
    }
}

function keyUpInputManager(event)
{
    for(const thrustInput of inputs.thrust)
    {
        if(event.key === thrustInput)
        {
            if(socket)
            {
                socket.send(JSON.stringify(
                    {
                        name : "stop_thrust"
                    }
                ))
            }
        }
    }
    for(const shootInput of inputs.shoot)
    {
        if(event.key === shootInput)
        {
            if(socket)
            {
                socket.send(JSON.stringify(
                    {
                        name : "stop_shoot"
                    }
                ))
            }
        }
    }
}


init()