import cloud from '@lafjs/cloud'
import WebSocket from 'ws'
import url from 'url';
import crypto from 'crypto';
import querystring from 'querystring';

class Ws_Param {
    // 初始化
    constructor(APPID, APIKey, APISecret, gpt_url) {
        this.APPID = APPID;
        this.APIKey = APIKey;
        this.APISecret = APISecret;
        this.host = url.parse(gpt_url).hostname;
        this.path = url.parse(gpt_url).pathname;
        this.gpt_url = gpt_url;
    }

    // 生成url
    create_url() {
        const date = new Date().toGMTString();
        // 拼接字符串
        let signature_origin = "host: " + this.host + "\n";
        signature_origin += "date: " + date + "\n";
        signature_origin += "GET " + this.path + " HTTP/1.1";
        // 进行hmac-sha256进行加密
        const signature_sha = crypto.createHmac('sha256', this.APISecret).update(signature_origin).digest();
        const signature_sha_base64 = Buffer.from(signature_sha).toString('base64');
        const authorization_origin = `api_key="${this.APIKey}", algorithm="hmac-sha256", headers="host date request-line", signature="${signature_sha_base64}"`;
        const authorization = Buffer.from(authorization_origin).toString('base64');
        // 将请求的鉴权参数组合为字典
        const v = {
            "authorization": authorization,
            "date": date,
            "host": this.host
        };
        // 拼接鉴权参数，生成url
        const url = "wss://" + this.host + this.path + '?' + querystring.stringify(v);
        return url;
    }
}

// 通过appid和用户的提问来生成请参数
function gen_params(appid, question) {
    return {
        "header": {
            "app_id": appid,
            "uid": "1234"
        },
        "parameter": {
            "chat": {
                "domain": "general",
                "random_threshold": 0.5,
                "max_tokens": 2048,
                "auditing": "default"
            }
        },
        "payload": {
            "message": {
                "text": [
                    { "role": "user", "content": question }
                ]
            }
        }
    };
}

export default async function (ctx: FunctionContext) {
    // 获取问题内容
    let question = ctx.query.question;
    // 配置api
    let appid = process.env.XH_APPID;
    let api_secret = process.env.XH_APISecret;
    let api_key = process.env.XH_APIKey;
    let gpt_url = "wss://spark-api.xf-yun.com/v1.1/chat"
    // 准备websocket请求的参数
    const wsParam = new Ws_Param(appid, api_key, api_secret, gpt_url);
    const wsUrl = wsParam.create_url();
    const ws = new WebSocket(wsUrl);

    ws.appid = appid;
    ws.question = question;

    // 用于存储websocket拿到的所有的消息
    let messages = [];

    return new Promise(async (resolve, reject) => {
        // 收到websocket消息的处理
        ws.on('message', function (message) {
            const data = JSON.parse(message);
            const code = data['header']['code'];
            if (code != 0) {
                console.log(`请求错误: ${code}, ${data}`);
                this.close();
            } else {
                const choices = data["payload"]["choices"];
                const status = choices["status"];
                const content = choices["text"][0]["content"];
                console.log(content);
                messages.push(content); // 由于websocket会多次返回消息，因此需要将消息存储在数组中，方便后续一次性返回
                if (status == 2) {
                    console.log(messages.join('\n'));
                    this.close();
                }
            }
        });
        // 收到websocket连接建立的处理
        ws.on('open', function () {
            // console.log("###########open")
            const data = JSON.stringify(gen_params(appid, question));
            ws.send(data);
        });
        ws.on('close', function () {
            console.log("### closed ###");
            resolve(messages);
            // return { messages: messages.join('\n') }; // 在 WebSocket 连接关闭时返回 HTTP 响应
        })
        // 收到websocket错误的处理
        ws.on('error', function (error) {
            console.error("### error:", error);
            reject(error);
        });
    });
}
