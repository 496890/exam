# 通用性知识问答系统

服务端基于Node.js

数据存储基于redis

配置信息基于静态json文件

界面UI基于weui.io

客户端js框架基于vue.2.6

最后修订 2023-09-10

============================

支持手机和PC端运行

通过配置文件绑定微信公众号appid，及微信网页应用appid

用户首次使用时，手机端（微信内）通过公众号拉起网页授权得到unionid，PC端则通过微信网页应用appid展示二维码，用微信扫码获取unionid。程序默认以浏览器session方式存储unionid，同时unionid为用户唯一身份凭证

redis记录用户答题基础信息，unionid为key，field为答题成绩、时间戳等，用户完整答题清单保存为json静态文件（unionid为文件名）

配置文件中将host设置为undefined或null，程序会跳过服务端处理，仅在浏览器端执行，成为单机应用，无排名数据

============================

# 系统运行演示UI
![image](https://github.com/496890/exam/assets/40753389/2e2adf45-9a72-4222-8251-01532e54f086)

![image](https://github.com/496890/exam/assets/40753389/aeaa6d52-a4d7-4d91-9f0b-2c3ad1dcf82b)

![image](https://github.com/496890/exam/assets/40753389/a3a76dfb-7aa0-4849-924c-49e0081fa4cc)

# 系统运行演示地址

