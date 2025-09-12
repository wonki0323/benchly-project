# app.py 파일 수정
from flask import Flask, request, jsonify, render_template # render_template 추가
from flask_cors import CORS
from googleapiclient.discovery import build

app = Flask(__name__)
CORS(app)

YOUTUBE_API_KEY = 'YOUR_API_KEY' # 여기에 당신의 API 키를 넣으세요

# 정문('/')으로 요청이 오면 index.html 파일을 보여주는 라우트 추가
@app.route('/')
def home():
    return render_template('index.html')

@app.route('/api/search', methods=['POST'])
def search():
    data = request.get_json()
    keyword = data.get('keyword')
    print("✅ 프론트엔드로부터 받은 키워드:", keyword)

    youtube = build('youtube', 'v3', developerKey=YOUTUBE_API_KEY)
    search_request = youtube.search().list(
        q=keyword,
        part='snippet',
        maxResults=10,
        type='video'
    )
    response = search_request.execute()
    return jsonify(response)

# gunicorn은 이 부분을 사용하지 않으므로, 그대로 두거나 지워도 괜찮습니다.
# if __name__ == '__main__':
#     app.run(debug=True)