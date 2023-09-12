'use strict';
class ExamModule
{
	constructor(config){
		this.users	= config.key;
	}
	save(unionid, data){
		redis.hset(this.users, unionid, data);
	}
	user(key, field){
		return new Promise( res=>{
			redis.hmget(key||'', field||'', (err, m)=>{res(m);});
		});
	}
	getall(key){
		return new Promise( res=>{
			redis.hgetall(key||'', (err, m)=>{res(m);});
		});
	}
}

const	http		= require('http'),				//http协议相关
		url			= require('url'),				//处理url相关
		fs			= require('fs'),				//文件系统相关
		ESDModule	= require('./esd'),
		ESD			= new ESDModule();

		ESD.Env('exam.json', fs);

const	Node		= {},
		I			= {
			path : process.env.exam_root,
			time : ESD.GetDate(0)				//记录系统开启时间，用于统计运行时间
		},
		redis		= require('redis').createClient(process.env.redis_port);
		redis.auth	(process.env.redis_password);
		redis.on	('error', err=>{
			if (err.code === 'ECONNRESET')
			{
				console.warn('Exam Redis', `客户端连接已恢复[${err.code}]`, ESD.GetDate(1));
			}
			else{
				console.error('Exam Redis', err, ESD.GetDate(1));
			}
		});
		redis.select(3);



const	UIN			= {
	/*配置公众号信息	*/	'test'	: {'name':'公众号信息',	'appid':'wxyxmbr8hmykz4qszj', 'secret':'5b7bwxfdcdy44ytabhygy6ptwbakygd8', 'mch_id':'12312312312', 'key':'yejxkrpzccsykmhisnydwc6yddc8dwbh', token:'', time:ESD.GetDate(0)},
};

const	Exam		= new ExamModule({key:'exam.users'}),
		ExamClient	= process.env.exam_client;		//网页授权完成后，跳转的URL





Node.init	= (Q, S)=>{
	//添加响应头
	S
	.setHeader('Access-Control-Allow-Origin', '*')
	.setHeader('Access-Control-Allow-Headers', 'X-Client-IP, Authorization')
	.setHeader('Access-Control-Expose-Headers', 'Authorization');

	console.log('No.'+ ESD.count(), ESD.GetDate(1) );
	console.log('URL:'		, Q.url);
	console.log('已运行:'	, ESD.TimeDiff(I['time']) );
	//当月计数器增量+1
	redis.multi().select(3).hincrby('analy.multi', ESD.GetDate(9).join(''), 1).exec();

	I.auth		= Q.headers['authorization'] || '';
	I.ip		= Q.headers['x-client-ip'];
	I.url		= url.parse(Q.url, true);					//将URL地址转换为JSON对象，true: URL参数（?以后的内容）同时转为子对象

	let N		= I.url.query;

	switch (N.type)
	{
	case 'oauth2'			:								//通过[code]换取网页授权，获取[openid]，以及[access_token]
		ESD.WX.oauth2(N.code, N.web).then( r=>{
			console.log(`网页授权`, r );
			fs.appendFile(`${I.path}/log/oauth2.log`, `${r.openid}, ${I.ip}, ${r.unionid}, ${r.scope}, ${N.redirect}, ${ESD.GetDate(1)}\n`, `utf-8`, err=>{});
			S.writeHead( 301, {'Location': `${ExamClient}#${r.unionid||''}`} );
			S.end();
		});
		break;
	case 'getall' :
		ESD.Post(Q).then( async r=>{
			let data	= await Exam.user(r.key, I.auth);
			if (data[0])
			{
				data	= await Exam.getall(r.key);
			}
			else{
				data	= {error : 2, data : '未获授权的数据访问请求！'};
			}
			ESD.HTML( S, JSON.stringify(data) );
		});
		break;
	case 'user' :
		ESD.Post(Q).then( r=>{
			Exam.user(r.key, r.field).then(m=>{ESD.HTML( S, JSON.stringify({error:0, data:m}) );});
		});
		break;
	case 'save' :
		ESD.Post(Q).then( r=>{
			if (r && r.unionid)
			{
				r.create_time	= ESD.GetDate(0);
				/*
				{
					unionid: '',
					name: '',
					phone: '',
					create_time: 0,
					status: 1,
					sheet: sheet,
					score: score,
					duration: duration
				}
				*/
				let unionid	= r.unionid,
					file	= JSON.stringify(r);

				delete r.unionid;	//删除unionid，用户答卷文件名直接以unionid保存
				delete r.sheet;		//删除答卷，减小redis存储大小

				Exam.save(unionid, JSON.stringify(r));

				fs.writeFile(`${I.path}/json/exams/${unionid}.json`, file, 'utf-8', ()=>{});

				ESD.HTML(S, `{"error":0, "data":"success"}` );
			}
			else
			{
				ESD.HTML(S, `{"error":1, "data":"数据参数不正确！"}`);
			}
		});
		break;
	default :
		ESD.HTML( S, JSON.stringify({type: N.type, data:N}) );
		break;
	}
};

ESD.WX				= {};

ESD.WX.Uin			= (N)=>{			//使用简称获得公众号相关配置数据
	return {appid:UIN[N].appid, secret:UIN[N].secret, name:N};
};
ESD.WX.oauth2		= (code, uin)=>{
	return new Promise( (res, rej)=>{
		uin		= ESD.WX.Uin(uin);
		fetch(`https://api.weixin.qq.com/sns/oauth2/access_token?appid=${uin.appid}&secret=${uin.secret}&code=${code}&grant_type=authorization_code`).then( r=>r.json() ).then( r=>{
			res(r||{});					//该接口只能获取[access_token, openid, unionid]，不包含其它用户信息，客户端发起授权时，[scope=snsapi_userinfo||snsapi_login]可以同时获取[unionid]
		});
	});
};


const	server		= http.createServer( Node.init ).listen(84, '0.0.0.0', () => {
	console.log('[Node.js]', 'Exam服务器已开启！ ' + ESD.GetDate(1) );
});


