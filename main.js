import cloud from '@lafjs/cloud'
import * as lark from '@larksuiteoapi/node-sdk';
import axios from 'axios';

const FeishuAppId = process.env.FS_APPID;
const FeishuAppSecret = process.env.FS_APPSECRET;

const client = new lark.Client({
    appId: FeishuAppId,
    appSecret: FeishuAppSecret,
    appType: lark.AppType.SelfBuild,
    domain: lark.Domain.Feishu,
});

export default async function (ctx: FunctionContext) {
    // 验证飞书消息
    const { body } = ctx
    if (body.challenge) return { challenge: body.challenge };

    // 获取事件 docs: https://open.feishu.cn/document/server-docs/event-subscription-guide/event-list
    const event = body.event;

    // 获取发送消息
    const message = event.message;
    const messageContent = JSON.parse(message.content).text?.replace('@_user_1 ', '') || '';
    console.log("=====================", messageContent)

    // 请求AI，返回ws链接
    const { data } = await axios.get(`https://yot0d4.laf.run/demo/getSpark?question=${messageContent}`);

    // 获取发送者的id，方便后续发送;  如果没有发送者（调试）发送给自己
    const sender_id = event?.sender?.sender_id?.open_id ?? process.env.FEISHU_MINE;

    // 飞书发送消息
    await client.im.message.create({
        params: {
            receive_id_type: 'open_id',
        },
        data: {
            receive_id: sender_id,
            content: JSON.stringify({ text: data.join('').trim() }),
            msg_type: 'text',
        },
    });
}
