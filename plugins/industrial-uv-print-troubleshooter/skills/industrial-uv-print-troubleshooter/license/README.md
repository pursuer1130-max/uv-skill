# 本机运行许可

仓库仅分发公开验证密钥 public_key.txt。由签发方另行提供 license.json 或 devices/<device_id>.json；不要提交这些文件。签名私钥必须保存在发布包之外。缺少本机运行许可时，node scripts/uv_hybrid.cjs license 应返回 LICENSE_MISSING，不能视为已获设备动作授权。
