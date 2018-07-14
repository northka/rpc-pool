/**
 * Created by nkchen on 2017/6/24.
 */
const UINT32 = require('cuint').UINT32;

const HEADER = Symbol('SqqPacket#HEADER');
const BODY   = Symbol('SqqPacket#BODY');

class SqqPacket{
    constructor(header, body){
        this[HEADER] = Buffer.allocUnsafe(20);
        if(Buffer.isBuffer(header)){
            this.header = header;
        }else{
            this[HEADER].fill(0);
        }
        if(Buffer.isBuffer(body)){
            this.body = body;
        }else{
            this[BODY] = Buffer.alloc(0)
        }
        this.status = 'receiveHeader';
    }
    get version (){
        return this[HEADER].readUInt8(0);
    }
    set version (value){
        this[HEADER].writeUInt8(value, 0);
    }
    get type (){
        return this[HEADER].readUInt8(1);
    }
    set type(value){
        this[HEADER].writeUInt8(value, 1);
    }
    get cmd(){
        return this[HEADER].readUInt16BE(2);
    }
    set cmd(value){
        this[HEADER].writeUInt16BE(value, 2);
    }
    get ip(){
        let ips = new Array(4);
        for(let i = 0;i < 4; i++){
            ips[i] = this[HEADER].readUInt8(4+i);
        }
        return ips.join('.');
    }
    set ip(value){
        if(Number.isInteger(value)){
            this[HEADER].writeUInt32BE(value);
        }
        if(typeof value=="string"){
            let ips =value.split('.');
            if(ips.length == 4){
                for(let i = 0; i < 4; i++){
                    this[HEADER].writeUInt8(ips[i], 4+i);
                }
            }
        }
    }
    get retCode(){
        return this[HEADER].readInt32BE(8);
    }
    set retCode(value){
        this[HEADER].writeInt32BE(value, 8);
    }
    get qq(){
        return this[HEADER].readUInt32BE(12);
    }
    set qq(value){
        this[HEADER].writeUInt32BE(value, 12);
    }
    get bodyLength(){
        return this[HEADER].readUInt32BE(16);
    }
    set bodyLength(value){
        this[HEADER].writeUInt32BE(value, 16);
    }
    get body(){
        return this[BODY];
    }
    set body(value){
        if(Buffer.isBuffer(value)){
            this.bodyLength = value.length;
            this[BODY] = value;
        }else{
            throw new Error('sqqPacket error: body must be a buffer');
        }
    }
    get header(){
        return this[HEADER];
    }
    set header(value){
        if(Buffer.isBuffer(value)){
            value.copy(this[HEADER]);
        }else{
            this[HEADER].fill(0);
        }
    }
    needReceiveData(){
        if(this.status === 'receiveHeader'){
            return {done: false, value: 20};
        }
        if(this.status === 'receiveBody'){
            return {done: false, value: this.bodyLength}
        }
        if(this.status === 'receivedData'){
            return {done: true, value: 0}
        }
    }
    parseData(data){
        if(this.status === 'receiveHeader'){
            this.header = data;
            this.status = 'receiveBody';
            return false;
        }
        if(this.status === 'receiveBody'){
            this.body = data;
            this.status = 'receivedData';
            return true;
        }
    }
    toPacket(){
        let totalLength = this[HEADER].length + this[BODY].length;
        if(this.bodyLength != this[BODY].length){
            throw new Error("sqqPacket error: the length of body don't equal to the number of header");
        }
        return Buffer.concat([this[HEADER], this[BODY]], totalLength);
    }
    get data(){
        return JSON.parse(this[BODY]);
    }
}

module.exports = SqqPacket;