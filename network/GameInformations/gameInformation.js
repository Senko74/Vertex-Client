const { getGameWithMode } = require("./getGameWithMode")
const { fingGameWithLink } = require("./fingGameWithLink")

async function gameInformation(gameLinkInput, mode)
{
    const value = gameLinkInput
    console.log("value :", value)
    if(!value)
    {
        const gameInfo = await getGameWithMode("survival")
        return gameInfo
    }
    else
    {
        console.log(value)
        return await fingGameWithLink(value)
    }
}

module.exports = { gameInformation }