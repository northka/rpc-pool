/**
 * Created by nkchen on 2017/6/24.
 */
const BUFFERS = Symbol('BufferHelper#buffers');
const SIZE = Symbol('BufferHelper#size');

//@see https://github.com/JacksonTian/bufferhelper
class BufferHelper{
    constructor(){
        this[BUFFERS] = [];
        this[SIZE]    = 0;
    }
    get length(){
        return this[SIZE];
    }
    concat(buffer){
        this[BUFFERS].push(buffer);
        this[SIZE] += buffer.length;
        return this;
    }
    empty(){
        this[BUFFERS] = [];
        this[SIZE]   = 0;
        return this;
    }
    toBuffer(){
        return Buffer.concat(this[BUFFERS], this[SIZE]);
    }
    toString(encoding){
        return this.toBuffer().toString(encoding);
    }
    shiftBuffer(){
        this[SIZE] -= this[BUFFERS][0].length;
        return this[BUFFERS].shift();
    }
    unshiftBuffer(buf){
        this[SIZE]    += buf.length;
        this[BUFFERS].unshift(buf);
        return this;
    }
    subBuffer(length){
        if(!length || length > this.length ){
            let temp = this.toBuffer();
            this.empty();
            return temp;
        }else{
            let bufs       = [],
                bufsLength = this[BUFFERS].length,
                len        = length;
            for(let i = 0; i < bufsLength; i++){
                let data = this.shiftBuffer();
                if(data.length > len){
                    let temp = Buffer.allocUnsafe(len);
                    data.copy(temp);
                    bufs.push(temp);
                    this.unshiftBuffer(data.slice(len));
                    len = 0;
                    break;
                }else{
                    len -= data.length;
                    bufs.push(data);
                }
            }
            return Buffer.concat(bufs, length);
        }
    }
    load(stream, callback){
        stream.on('data', (trunk)=>{
            this[BUFFERS].push(trunk)
        });
        stream.on('end', (trunk) =>{
            callback(null, this.toBuffer())
        });
        stream.on('error', callback)
    }
}

module.exports = BufferHelper