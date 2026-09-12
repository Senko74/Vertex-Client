class InputSender
{
    constructor(socket)
    {
        this.socket = socket
    }

    input(key)
    {
        if(key === "thrust")
        {
            this.thrust()
        }
        else if(key === "shoot")
        {
            this.shoot()
        }
        else if(key === "stop_thrust")
        {
            this.stop_thrust()
        }
        else if(key === "stop_shoot")
        {
            this.stop_shoot()
        }
    }

    thrust()
    {
        this.socket.send(4096)
    }

    stop_thrust()
    {
        this.socket.send(0)
    }

    shoot()
    {
        this.socket.send(8192)
        this.sayWord()
    }

    sayWord()
    {
        this.socket.send(JSON.stringify(
            {
                name : "say",
                data : "aa"
            }
        ))
    }

    stop_shoot()
    {
        this.socket.send(0)
    }
}

module.exports = { InputSender }