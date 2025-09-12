from flask import Flask, request, jsonify
from flask_cors import CORS
from googleapiclient.discovery import build # 구글 API 클라이언트 라이브러리 추가

app = Flask(__name__)
CORS(app)

# 1단계에서 발급받은 당신의 유튜브 API 키를 여기에 붙여넣으세요.
YOUTUBE_API_KEY = 'AIzaSyAbhifkk3DT3xqKSxr4GW2ZG-aggN248VE' 

@app.route('/api/search', methods=['POST'])
def search():
    data = request.get_json()
    keyword = data.get('keyword')
    print("✅ 프론트엔드로부터 받은 키워드:", keyword)

    # 유튜브 API 서비스 객체 생성
    youtube = build('youtube', 'v3', developerKey=YOUTUBE_API_KEY)

    # 유튜브 검색 실행
    search_request = youtube.search().list(
        q=keyword,          # 검색어
        part='snippet',     # 가져올 정보 (제목, 설명 등)
        maxResults=10,      # 최대 10개의 결과
        type='video'        # 비디오만 검색
    )

    # 검색 결과 받기
    response = search_request.execute()

    # 터미널에 유튜브로부터 받은 원본 데이터 출력 (우리가 확인하기 위함)
    print("✅ 유튜브로부터 받은 데이터:", response)

    # 프론트엔드에 최종 결과 데이터 보내기
    return jsonify(response)

if __name__ == '__main__':
    app.run(debug=True)