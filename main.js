import { init, changeChipColor } from "./rendering/lobby/backgroundLobby";
import * as gameRender from "./rendering/game/gameRender.js"
const colorInput = document.querySelector("#color")
const playButton = document.querySelector("#play")

colorInput.addEventListener("input", (event) =>
{
    changeChipColor(parseInt(colorInput.value.slice(1), 16)%360)
})

playButton.addEventListener("click", () =>
{

})

function joinGame()
{

}

init()