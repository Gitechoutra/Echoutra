from base64 import b64encode, b64decode
from Crypto.Cipher import AES
from Crypto.Random import get_random_bytes
import json
class Encryption:
    def __init__(self):
        self.key = 'G5^T)g(d^fJ7Ycbv'
        self.private_key = b'jK0f4c$Om^nc6fU$'

    def encrypt(self, data):
        salt = get_random_bytes(AES.block_size)
        cipher_config = AES.new(self.private_key, AES.MODE_GCM)
        cipher_text, tag = cipher_config.encrypt_and_digest(bytes(data, 'utf-8'))
        return json.dumps({
        'cipher_text': b64encode(cipher_text).decode('utf-8'),
        'salt': b64encode(salt).decode('utf-8'),
        'nonce': b64encode(cipher_config.nonce).decode('utf-8'),
        'tag': b64encode(tag).decode('utf-8')
        })

    def decrypt(self, data):
        data = json.loads(data)
        salt = b64decode(data['salt'])
        cipher_text = b64decode(data['cipher_text'])
        nonce = b64decode(data['nonce'])
        tag = b64decode(data['tag'])
        cipher = AES.new(self.private_key, AES.MODE_GCM, nonce=nonce)
        decrypted = cipher.decrypt_and_verify(cipher_text, tag)
        return decrypted.decode("utf-8")


# print(Encryption().encrypt("Manomay@0813!"))
#print(Encryption().decrypt('{"cipher_text": "nCcq1EYz7v8/C7UlYvSw9qediA==", "salt": "6IOS35798ROcIbljFB7alg==", "nonce": "HjvhhOEG7PxM7vflWwTE9A==", "tag": "XIfDzektrYCpBiTzfFZArA=="}'))
