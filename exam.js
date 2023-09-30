/*!
	易时代 问卷答题系统客户端程序
	最后修订： 2023/9/30

	基于微信的网页授权（公众号需要具备网页授权能力）
	1.微信端用户确认授权
	2.PC端显示二维码，微信扫码授权

	服务端请求
	1.凭Unionid获取当前用户		/?type=user
	2.完成答题（交卷）			/?type=save
	3.获取所有用户及答题成绩	/?type=getall

	Redis
	数据Key名	exam.users
	类型		hash

	用于本地浏览器存储的Session名
	app.exam.unionid

 */

class Auth extends AuthBase
{
	constructor(auth={}){
		const	appid		= auth.appids,
				redirect	= {
					web			: `https://open.weixin.qq.com/connect/qrconnect?appid=${appid.web}&redirect_uri={url}&response_type=code&scope=snsapi_login&state={state}#wechat_redirect`,
					subscribe	: `https://open.weixin.qq.com/connect/oauth2/authorize?appid=${appid.subscribe}&redirect_uri={url}&response_type=code&scope=snsapi_userinfo&state={state}#wechat_redirect`
				};
		//初始化默认值
		super( Object.assign({
			oauth2	: redirect.subscribe,
			appid	: appid.web,
		}, auth) );
	}
}

class Unionid
{
	constructor(host){
		const hash		= ESD.Hash();

		this.session	= 'app.exam.unionid';
		this.host		= host;
		this.unionid	= ESD.getItem(this.session, 'session') || hash.unionid || '';

		/* 检测到有通过url传递的unionid时，进行本地化存储 */
		if ( hash.unionid ){ESD.setItem(this.session, hash.unionid, 'session');}

		history.replaceState(null, null, ' ');
	};
	check(){
		return new Promise( res=>{
			if (this.unionid)
			{
				fetch(`${this.host}/?type=user`, {
					method: 'post',
					headers: {'Authorization': this.unionid},
					body: JSON.stringify({key: Config.DB, field: this.unionid})
				}).then(r=>r.json()).then(r=>{
					console.log(r);
					r	= ESD.isJSON(r.data[0]);
					if ( r.status )
					{
						r.unionid	= this.unionid;
						res(r);	//已登记 已考试
					}
					else
					{
						res({status: -1, unionid: this.unionid});
					}
				});
			}
			else{
				//未登录
				setTimeout(()=>{res({});}, 500);
			}
		});
	};
}

/*
答题程序组件
user	提取到用户信息后，右上角显示问候语
ranks	排行榜，排序规则：按得分倒序排列，相同得分按用时多少顺序排列
honor	答题成绩
exams	系统主程序组件
*/
Vue.component('c-user', {
	props	 : ['user'],
	template : `
		<transition name="slideRight">
			<div class="weui-user" title="您好，" v-if="user.name">{{user.name}}</div>
		</transition>
	`
});
Vue.component('c-ranks',{
	props	 : ['title', 'user'],
	data	 : function(){return {json: {}};},
	template : `
			<div class="weui-form">
				<div class="weui-form__text-area">
					<h2 class="weui-form__title large">{{TXT.TopTitle.replace(/{@count}/, Config.Tops)}}</h2>
					<h2 class="weui-form__desc">{{title}}</h2>
				</div>
				<ul class="weui-ranking">
				<li class="Ranking">排名</li><li class="Name">{{TXT.Name}}</li><li>用时</li><li class="Result">得分</li>
				</ul>
				<transition name="fade">
					<div class="weui-form__tips-area" v-if="!Object.keys(json).length"><i class="weui-mask-loading"></i></div>
				</transition>
				<ul class="weui-ranking" v-for="(m,n) in list" :key="m">
				<li class="Ranking SN">{{n+1}}</li><li class="Name">{{m.name}}</li><li>{{m.duration}}秒</li><li class="Result">{{m.score}}</li>
				</ul>
				<div class="weui-form__ft">
					<div class="weui-form__tips-area"></div>
				</div>
			</div>
	`, created() {
		if (Config.host)
		{
			fetch(`${Config.host}/?type=getall`, {
				method	: 'post',
				headers	: {'X-Client-IP': this.user.ip, 'Authorization': this.user.unionid || encodeURIComponent(this.user.name)},
				body	: JSON.stringify({key:Config.DB})
			}).then(r=>r.json()).then(r=>{
				if (r.error)
				{
					weui.topTips(`错误：${r.data}`);
					r	= {};
				}
				setTimeout( ()=>{this.json	= r || {};}, 500);
			});
		}
	}, computed: {
		list(){
			return Object.values(this.json).map(m=>ESD.isJSON(m))
				.sort((a,b)=>b.score-a.score)
				.sort((a,b)=>a.duration-a.duration).slice(0, Config.Tops).map(m=>{
					return {name: m.name, duration: m.duration.roundSecond(), score: m.score};
				});
		}
	}
});
Vue.component('c-honor',{
	props	 : ['title', 'user'],
	template : `
				<div class="weui-msg">
					<div class="weui-msg__icon-area"><i class="weui-icon-success weui-icon_msg"></i></div>
					<div class="weui-msg__text-area">
						<h2 class="weui-msg__title">{{title}}</h2>
						<p class="weui-msg__desc">您的本次答题已全部完成，从第1题开始到提交，用时{{user.duration.roundSecond()}}秒，最终得分：<span class="score">{{user.score}}</span>分，感谢您的参与，稍后请关注获奖名单！</p>
						<div class="weui-msg__custom-area">
							<ul class="weui-form-preview__list">
								<li class="weui-form-preview__item" v-for="m in result" :key="m"><label class="weui-form-preview__label">{{m.key}}</label><p class="weui-form-preview__value">{{m.value}}</p></li>
							</ul>
						</div>
					</div>
				</div>
	`, computed: {
		result(){
			let {name, phone, duration, create_time} = this.user;
			return [
				{key: TXT.Name,		value: name},
				{key: TXT.Phone,	value: phone},
				{key: '日期',		value: ESD.GetDate(1, create_time)},
				{key: '用时',		value: duration.roundSecond()+'秒'},
			];
		}
	}
});
Vue.component('c-exams',{
	props	 : ['title', 'intro', 'list', 'config', 'user'],
	data	 : function(){
		return {
			option	: 'ABCDEFGHIJK',	//根据当前问题答案（选项列表数组元素）的索引值来定位其作为选项的序号
			progress: 0,
			duration: ESD.GetDate(0),	//考生完成答卷所用时间，从完成第一题开始记录时间戳，直到最后一题完成时计算时间差
		}
	},
	template : `
			<div class="weui-form">
				<div class="weui-form__text-area">
					<h2 class="weui-form__title">{{title}}</h2>
					<div class="weui-form__desc">{{intro}}</div>
					<div class="weui-msg__custom-area">
						<ul class="weui-form-preview__list">
							<li class="weui-form-preview__item"><label class="weui-form-preview__label">开始</label><p class="weui-form-preview__value">{{config.start}}</p></li>
							<li class="weui-form-preview__item"><label class="weui-form-preview__label">结束</label><p class="weui-form-preview__value">{{config.end}}</p></li>
						</ul>
					</div>
				</div>
				<div class="weui-form__control-area" v-if="user.status<0">
					<div class="weui-form__text-area">
						<div class="weui-form__title">{{TXT.Register}}</div>
					</div>
					<div class="weui-cells__group weui-cells__group_form">
						<div class="weui-cells__title">填写您的资料</div>
						<div class="weui-cells">
							<label class="weui-cell weui-cell_active">
								<div class="weui-cell__hd"><span class="weui-label">{{TXT.Name}}</span><div class="weui-cell__desc">{{TXT.Name_Desc}}</div></div>
								<div class="weui-cell__bd">
									<input type="text" class="weui-input" placeholder="必填项" maxlength="9" v-model.lazy.trim="user.name" />
								</div>
							</label>
							<label class="weui-cell weui-cell_active">
								<div class="weui-cell__hd"><span class="weui-label">{{TXT.Phone}}</span><div class="weui-cell__desc">{{TXT.Phone_Desc}}</div></div>
								<div class="weui-cell__bd">
									<input type="number" class="weui-input" placeholder="必填项" maxlength="11" v-model="user.phone" />
								</div>
							</label>
						</div>
					</div>
				</div>
				<div class="weui-form__control-area" v-else>
					<div class="weui-cells__group weui-cells__group_form" v-for="(val, key, index) in questions" :key="key">
						<div class="weui-cells__title">{{subTitle(key, index)}}</div>
						<div class="weui-cells" v-for="(m,n) in questions[key]" :key="m">
							<label class="weui-cell">
								<span class="wuei-cell__hd">{{ESD.FixNum(n+1,2)}}.</span>
								<span class="weui-cell__bd">
									<span>{{m.question}}</span>
									<div class="weui-cell__desc">该题得分：<u>{{config.type[key].point}}</u>分</div>
									<div class="weui-cells" :class="m.type=='multi'?'weui-cells_checkbox':'weui-cells_radio'">
										<label class="weui-cell weui-check__label" :for="key+n+i" v-for="(item,i) in m.option" :key="item">
											<div class="weui-cell__hd">{{option.substr(i,1)}}.</div>
											<div class="weui-cell__bd">
												<p>{{item}}</p>
											</div>
											<div class="weui-cell__ft">
												<input type="checkbox"	v-if="m.type=='multi'"	class="weui-check" :name="key+n" :id="key+n+i" v-model="m.answer" :value="option.substr(i,1)" />
												<input type="radio"		v-else					class="weui-check" :name="key+n" :id="key+n+i" v-model="m.answer" :value="option.substr(i,1)" />
												<span class="weui-icon-checked"></span>
											</div>
										</label>
									</div>
								</span>
							</label>
						</div>
					</div>
				</div>
				<div class="weui-form__tips-area" v-if="user.status==-1">
					<p class="weui-form__tips">请正确填写资料以激活确认按钮</p>
				</div>
				<div class="weui-form__opr-area" v-if="[-1,0].includes(user.status)">
					<a class="weui-btn weui-btn_primary" :class="{'weui-btn_disabled':disabled}" href="javascript:" @click="submission">{{user.status==0?'交卷':'确认'}}</a>
				</div>
			</div>
	`, watch: {
		list: {
			handler(val){
				let r	= this.list.filter(m=>m.answer&&m.answer.length);
				console.log('vue.list', this.list.length, r.length);
				this.progress	= r.length;
				this.$emit('progress', r.length);
				if (r.length==1)
				{
					this.duration	= ESD.GetDate(0);
				}
			},
			deep: true
		},
	}, computed: {
		disabled(){
			if (this.user.status<0)
			{
				return !( this.user.name && ESD.Phone(this.user.phone) );
			}
			return this.progress != this.list.length;
		},
		questions(){
			let l	= {};
			for (let k in this.config.type)
			{
				l[k]	= this.list.filter(m=>m.type==k);
			}
			return l;
		}
	}, methods: {
		subTitle(key, index){
			const	item	= this.config.type[key];
			return `${'一二三四五六七八九十'.substr(index, 1)}、${item.name} （每题${item.point}分，总计${this.questions[key].length*item.point}分）`;
		},
		submission(){
			if (this.disabled)
			{
				return;
			}
			/*
			[user]
			为空时，判断为需要先登记考生资料
			非空时，二次判断[status]值，-1未登记，0只登记未考试，1已考试

			仅以下2种情况需要执行
			[status]	-1		考生资料登记
			[status]	 0		保存答卷

			测试数据
			Object.assign(vue.user, {"status":0,"name":"张三","phone":"18989511115"});vue.list.forEach(m=>{let k=m.key.toUpperCase(); m.answer=m.type=='multi'?Array.from(k):k;})
			*/
			switch (this.user.status)
			{
			case -1:
				this.user.status++;
				break;
			case 0:
				try
				{
					weui.loading('正在提交...');
					let score	= 0,
						sheet	= this.list.map(m=>{
							switch (m.type)
							{
							case 'multi':	m.answer	= m.answer.sort().join(''); break;
							}
							score += m.answer.toLowerCase() == m.key ? this.config.type[m.type].point : 0;
							delete m.type;
							delete m.question;
							delete m.option;
							return m;
						});

					Object.assign(this.user, {sheet: sheet, score: score, duration: ESD.GetDate(0)-this.duration, status: 1});

					// console.log('Answer Sheet', this.user);
					if (Config.host)
					{
						fetch(`${Config.host}/?type=save`, {
							method: 'post',
							headers: {'Authorization': this.user.unionid},
							body: JSON.stringify(this.user)
						}).then(r=>r.json()).then(r=>{
							weui.loading().hide();
							if (r.error)
							{
								weui.topTips(`错误：${r.data}`);
							}
							else
							{
								weui.toast('成绩已保存');
								this.$emit('complete', this.user);
							}
						});
					}
					else
					{
						this.$emit('complete', this.user);
					}

				}
				catch (e){
					weui.topTips(`错误：${e}`);
				}
				break;
			}
		}
	}
});

/*
对数字毫秒转换为秒的自定义方法，0.5秒以下依据四舍五入都转为0
*/
Number.prototype.roundSecond	= function(){return Math.round(this/1000);};

/*
基础配置常量
Config	服务端，将属性host设置为null，或者undefined，答题系统就只在客户端执行
		取消服务端，同时也会自动取消微信网页授权
		同时，排行榜也自动隐藏
TXT		可能需要自定义改动的界面提示文本
SESSION	自定义浏览器SessionStorage存储名称
Review	答题结束后，是否允许浏览试题
Tops	控制排行榜输出数量
Icon	底部3个菜单项SVG图标
*/
const	TXT		= {
			Menu	: []
		},
		Config	= {
			DB		: 'exam.users',
			SESSION	: 'exam.user',
			Review	: false,
			Tops	: 10,
		},
		Icon	= {
			exams	: '<svg t="1685369619895" class="icon" viewBox="0 0 1256 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="2749" width="108" height="108"><path d="M201.681455 74.472727a111.709091 111.709091 0 0 0-111.709091 111.709091v651.636364a111.709091 111.709091 0 0 0 111.709091 111.709091h837.818181a111.709091 111.709091 0 0 0 111.709091-111.709091V186.181818a111.709091 111.709091 0 0 0-111.709091-111.709091h-837.818181z m0-74.472727h837.818181a186.181818 186.181818 0 0 1 186.181819 186.181818v651.636364a186.181818 186.181818 0 0 1-186.181819 186.181818h-837.818181a186.181818 186.181818 0 0 1-186.181819-186.181818V186.181818a186.181818 186.181818 0 0 1 186.181819-186.181818zM302.08 719.592727a24.669091 24.669091 0 0 1-10.333091-3.258182c-19.456-8.005818-40.587636-9.076364-43.240727-33.652363-2.513455-23.738182 12.474182-78.336 23.086545-101.003637A1441.512727 1441.512727 0 0 1 345.832727 446.603636l-1.117091-0.837818-43.892363 21.876364c-1.861818 1.210182-10.519273 5.864727-12.474182 6.144-5.306182 0.558545-5.12-7.540364-5.026909-10.426182-0.558545-13.730909 8.564364-19.083636 19.456-26.903273 14.801455-10.705455 65.861818-48.174545 79.266909-49.524363 12.567273-1.256727 24.901818 23.179636 25.739636 30.301091 1.536 13.730909 1.396364 12.381091-60.416 146.52509-13.824 29.649455-45.986909 100.445091-42.496 132.142546 0.558545 5.771636 2.513455 10.845091 3.211637 16.477091 0.418909 4.235636-1.675636 6.842182-6.050909 7.261091z m416.674909-279.458909c9.914182 90.763636-60.276364 223.464727-175.336727 243.665455-44.032 7.912727-74.658909-32.256-79.127273-72.471273-5.911273-53.341091 22.341818-115.665455 53.666909-158.161455 37.329455-50.362182 106.961455-95.092364 138.286546-98.39709 19.735273-2.048 45.893818 18.152727 47.010909 28.532363 0.558545 5.213091-10.938182 6.469818-13.963637 10.146909 22.341818 4.421818 27.368727 27.741091 29.463273 46.685091z m-85.178182 121.018182c18.618182-25.413818 53.434182-86.062545 50.082909-117.294545-1.117091-9.914182-7.959273-27.322182-21.410909-25.972364-12.567273 1.396364-23.179636 20.154182-27.927272 20.712727-3.909818 0.418909-5.492364-5.073455-5.771637-7.912727-81.361455 56.878545-112.128 128.093091-109.614545 177.105454 0.465455 9.029818 5.445818 36.212364 18.897454 34.816 14.429091-1.489455 43.333818-22.760727 53.248-33.88509l42.542546-47.616z m357.282909-149.876364c10.053818 90.856727-60.136727 223.511273-175.336727 243.712-44.032 7.912727-74.658909-32.256-79.127273-72.471272-5.911273-53.341091 22.341818-115.665455 53.666909-158.161455 37.329455-50.362182 106.961455-95.092364 138.286546-98.397091 19.735273-2.048 45.893818 18.152727 47.010909 28.532364 0.558545 5.213091-10.938182 6.469818-13.963636 10.146909 22.341818 4.421818 27.368727 27.741091 29.463272 46.685091z m-85.178181 121.018182c18.757818-25.506909 53.434182-86.016 50.082909-117.294545-1.117091-9.867636-7.959273-27.275636-21.410909-25.925818-12.567273 1.396364-23.179636 20.154182-27.927273 20.712727-3.770182 0.418909-5.445818-5.073455-5.771637-7.912727-81.361455 56.878545-112.128 128.093091-109.614545 177.105454 0.465455 9.029818 5.445818 36.212364 18.897455 34.816 14.429091-1.489455 43.333818-22.760727 53.248-33.885091l42.542545-47.616z m-79.546182 171.287273s70.888727-5.957818 110.498909-7.447273c0 0-333.917091 26.205091-623.522909 127.069091 0 0-42.216727 18.897455-49.477818 15.592727-14.429091-6.423273 0-15.639273 0-15.639272-4.468364 2.094545 252.090182-105.192727 616.634181-127.069091 0 0-35.095273 4.421818-54.132363 7.447272z m110.498909 20.945454s-35.095273 4.514909-53.992727 7.447273c0 0 70.749091-5.911273 110.312727-7.447273-322.141091 25.227636-323.397818 22.481455-623.476364 127.069091 0 0-42.216727 18.897455-49.524363 15.639273-14.429091-6.469818 0-15.639273 0-15.639273s216.203636-103.191273 616.680727-127.069091zM248.226909 186.181818a23.272727 23.272727 0 1 1 0-46.545454h526.941091a23.272727 23.272727 0 0 1 0 46.545454H248.273455z m0 93.090909a23.272727 23.272727 0 1 1 0-46.545454h263.447273a23.272727 23.272727 0 1 1 0 46.545454h-263.447273z" fill="#ea9518" p-id="2750"></path></svg>',
			honor	: '<svg t="1685370050656" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="15849" width="108" height="108"><path d="M845.444741 620.923259a10428.871111 10428.871111 0 0 1 120.907852 301.24563c-8.533333 8.040296-10.619259 12.705185-14.829037 14.336a8.116148 8.116148 0 0 1-6.181926-0.18963l-190.084741-84.954074-84.15763 151.324445a18.962963 18.962963 0 0 1-34.512592-3.109926l-76.079408-223.990519c122.121481 7.661037 217.050074-43.880296 284.937482-154.661926z m-666.510222-2.427259c65.991111 112.791704 160.843852 165.129481 284.558222 157.089185l-76.079408 223.990519a18.962963 18.962963 0 0 1-34.512592 3.109926l-84.195556-151.324445-189.743407 84.840296a8.571259 8.571259 0 0 1-6.523259 0.18963c-4.437333-1.668741-6.674963-6.599111-14.71526-14.715259 33.147259-87.87437 73.53837-188.946963 121.21126-303.179852zM504.604444 0c195.584 0 354.190222 160.919704 354.190223 359.386074 0 198.504296-158.606222 359.386074-354.228148 359.386074-195.584 0-354.152296-160.881778-354.152297-359.386074C150.414222 160.919704 308.982519 0 504.604444 0z m-15.284148 145.635556l-1.782518 2.920296-54.158222 111.350518-121.704297 17.938963a18.962963 18.962963 0 0 0-12.781037 29.658074l2.23763 2.616889 88.215704 87.22963-20.745482 122.88a18.962963 18.962963 0 0 0 24.462222 21.238518l3.147852-1.327407 108.392296-57.799111 108.392297 57.799111a18.962963 18.962963 0 0 0 27.875555-16.459852l-0.265481-3.413333-20.783408-122.88 88.25363-87.267556a18.962963 18.962963 0 0 0-7.243852-31.478518l-3.337481-0.758519-121.666371-17.976889-54.196148-111.350518a18.962963 18.962963 0 0 0-32.312889-2.920296z" fill="#d81e06" p-id="15850"></path></svg>',
			ranks	: '<svg t="1685370291984" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="17385" width="108" height="108"><path d="M685 472.2v-328c0-6.6-5.4-12-12-12H352.1c-6.6 0-12 5.4-12 12v189.6c0 3.3-2.7 6-6 6H76.2c-6.6 0-12 5.4-12 12v596.5c0 6.6 5.4 12 12 12H949c6.6 0 12-5.4 12-12V490.2c0-6.6-5.4-12-12-12H691c-3.3 0-6-2.7-6-6z m-556.8 418V409.8c0-3.3 2.7-6 6-6h199.9c3.3 0 6 2.7 6 6v480.5c0 3.3-2.7 6-6 6H134.2c-3.3-0.1-6-2.8-6-6.1z m282.4 6c-3.3 0-6-2.7-6-6V339.8h-0.5V202.1c0-3.3 2.7-6 6-6H615c3.3 0 6 2.7 6 6v688.1c0 3.3-2.7 6-6 6H410.6z m480.4 0H691c-3.3 0-6-2.7-6-6v-342c0-3.3 2.7-6 6-6h200c3.3 0 6 2.7 6 6v342.1c0 3.2-2.7 5.9-6 5.9z" p-id="17386" fill="#1296db"></path><path d="M472.9 259.8v37.7l32.8-28.5v115.8H541V231.3h-35.3zM264.4 521c12.3-12.9 19-21.6 19-37.7 0-28.9-20.7-46.3-49.1-46.3-26.7 0-49.6 16.6-49.6 46.8H220c0-11.9 7.8-14.9 14.2-14.9 9.1 0 13.8 5.8 13.8 14.2 0 6.5-2.2 10.3-7.8 16.4l-55.6 60.3v31.9h98.7v-31.9h-55.6l36.7-38.8zM791.8 607.8c7.3 0 14 5 14 14.7 0 6.9-4.1 14.4-14.7 14.4h-5v30.6h5c9.5 0 16.4 6.9 16.4 16.2 0 11-6.5 16.4-15.7 16.4-8.8 0-15.7-5.4-15.7-16.2h-35.3c0 34.5 25.6 48.1 51.1 48.1 26.9 0 51.1-15.1 51.1-47.2 0-18.3-9.3-27.6-17.7-33.4 7.8-5 15.9-13.1 15.9-30 0-26.5-20.9-45.5-49.4-45.5-27.4 0-49.4 17.5-49.4 46.3h35.3c0.1-9.2 6.7-14.4 14.1-14.4z" p-id="17387" fill="#1296db"></path></svg>'
		};

const	vue		= new Vue({el: '.weui-exam', template: `
	<div class="weui-tab">
		<template>
		<div class="weui-tab__panel">
			<c-ranks	v-if="page=='ranks'"	:title="title"	:user="user"	/>
			<c-honor	v-if="page=='honor'"	:title="title"	:user="user"	/>
			<c-exams	v-if="page=='exams'"	:title="title"	:user="user"	:list="list" :config="config" :intro="intro" @progress="transfer_progress" @complete="transfer_complete" />
			<c-user		:user="user"	/>
		</div>
		<div class="weui-tabbar">
			<div class="weui-tabbar__item" :class="{'weui-bar__item_on':m.id==page}" v-for="m in menus" :key="m" @click="page=m.id">
				<div class="weui-icon">
					<span v-html="Icon[m.id]"></span>
					<span class="weui-badge" v-if="m.badge" :count="m.badge.count" :total="m.badge.total">/</span>
				</div>
				<p class="weui-tabbar__label">{{m.name}}</p>
			</div>
		</div>
		</template>
	</div>
`, data: {
	title	: '',
	intro	: '',
	config	: {type:{}, menu:[]},
	progress: 0,
	page	: 'exams',			//对应切换[weui-tabbar__item]
	user	: {},				//{status: -1, unionid: '', name: '', phone: '', score: 0, create_time: 0}
	list	: []
}, created(){
	weui.loading('正在加载...');

	fetch(`json/exam.config.json?${ESD.GetDate(0)}`).then(r=>r.json()).then(r=>{
		r.list	= r.list.map(m=>{
			switch (m.type)
			{
			case 'bool':	m.option	= ['正确', '错误']; break;
			case 'multi':	m.answer	= []; break;
			}
			return m;
		});
		Object.assign(this, r);
		Object.assign(Config, r.config.setup);
		Object.assign(TXT, r.config.text);

		this.config.menu	= TXT.Menu.slice(0,(Config.host?3:2));

		ESD.$('title').element.text	= r.title;

		let {start, end, appid}	= r.config,
			c_date	= (date)=>{
				return `${ESD.GetDate(6, date)} ${ESD.GetDate(3, date).split(':').slice(0,2).join(':')}`;
			},
			c_conf	= null;

		if (ESD.GetDate(0, end	) < ESD.GetDate(0)){c_conf	= {content: TXT.OVER,		title: c_date(end),		text: '结束'};}
		if (ESD.GetDate(0, start) > ESD.GetDate(0)){c_conf	= {content: TXT.PENDING,	title: c_date(start),	text: '开始'};}

		if (c_conf)
		{
			weui.dialog({title: r.title, className: 'weui-dialog__warning', content: `${c_conf.content}	<i class="date" title="${c_conf.title}">${c_conf.text}时间：</i>`, buttons: []});
			weui.loading().hide();
		}
		else if (Config.host)
		{
			new Unionid(Config.host).check().then(u=>{
				weui.loading().hide();
				switch (u.status)
				{
				case 1:
					this.page	= 'honor';
				case 0:
				case -1 :
					this.user	= u;
					break;
				default :
					new Auth({host: Config.host, href: Config.qrcode, webapp: Config.webapp, appids: appid, redirect: 'exam'});
					break;
				}
				console.log('check user', u);
			});
		}
		else
		{
			let client	= ()=>{
				return new Promise(res=>{
					let u	= ESD.getItem(Config.SESSION);
						u	= ESD.isJSON(u) || {status: -1, unionid: ESD.RandomStr(28)};
					setTimeout( ()=>{res(u);}, 1000);
				});
			};
			client().then(u=>{
				weui.loading().hide();
				this.user	= u;
			});
		}
	});
}, watch: {
	page(val,old){
		if (this.user.status!=1)
		{
			this.page	= 'exams';
			weui.topTips(TXT.Deny);
		}
		else if (val=='exams' && !Config.Review)
		{
			this.page	= old;
			weui.topTips(TXT.Done);
		}
	}
}, computed: {
	menus(){
		return this.config.menu.map((m,n)=>{
			return {id: ['exams', 'honor', 'ranks'][n], name: m, badge: (this.user.status==0 && !n?{count:this.progress, total:this.list.length}:null)};
		});
	},
}, methods: {
	transfer_progress(n){
		this.progress	= n;
	},
	transfer_complete(u){
		this.page	= 'honor';
		this.user	= u;
		ESD.setItem(Config.SESSION, JSON.stringify(u), 'session');
	}
}});
