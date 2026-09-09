import { init, changeChipColor } from "./rendering/backgroundLobby";
const colorInput = document.querySelector("#color")

colorInput.addEventListener("input", (event) =>
{
    changeChipColor(parseInt(colorInput.value.slice(1), 16)%360)
})

init()