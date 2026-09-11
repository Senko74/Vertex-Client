function buildWsUrl(address) 
{
    let validAdress = address.toString()
    
    const [ip, port] = address.split(":")
    const hostname = ip.split(".").join("-")
    return `wss://${hostname}.starblast.io:${port}/`
}

module.exports = { buildWsUrl }