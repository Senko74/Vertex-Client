import { init, changeChipColor, stopRendering } from "./rendering/lobby/backgroundLobby";
import { initGameRenderer, onServerMessage } from "./rendering/game/gameRender"

const inputs = 
{
    thrust : ["w", "z", "ArrowUp"],
    shoot : [" "]
}

const colorInput = document.querySelector("#color")
const playButton = document.querySelector("#play")
const gameLink = document.querySelector("#gamelink")
const lobby = document.querySelector("#lobby")
const gameCanvas = document.querySelector("#canvasGame")

let actionsValue = 0

//LOCAL WS SERVER TO EXE NODE JS 
const socket = new WebSocket("ws://localhost:9000")
socket.binaryType = "arraybuffer"

socket.addEventListener("message", (message) =>
{
    const array = Array.from(new Uint8Array(message.data))
    console.log(array)
    let msg
    try
    {
        msg = JSON.parse(message.data)
    }
    catch(err)
    {
        onServerMessage(message)
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
    stopRendering()
    startGameRendering()
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
    if(event.repeat) { return }
    keyDownInputManager(event)
})

window.addEventListener("keyup", (event) =>
{
    if(event.repeat) { return }
    keyUpInputManager(event)
})

function keyDownInputManager(event)
{
    for(const thrustInput of inputs.thrust)
    {
        if(event.key === thrustInput)
        {
            actionsValue += 4096
            sendActionsValue()
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
            actionsValue += 8192
            sendActionsValue()
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
            actionsValue -= 4096
            sendActionsValue()
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
            actionsValue -= 8192
            sendActionsValue()
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

function sendActionsValue()
{
    console.log(actionsValue)
}

function startGameRendering()
{
    lobby.style.display = "none"
    gameCanvas.style.display = "block"
    initGameRenderer()
}

init()