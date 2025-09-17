from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
from googleapiclient.discovery import build
import os
from datetime import datetime, timezone, timedelta
import isodate  # 영상 길이를 초 단위로 변환하기 위해 import

app = Flask(__name__)
CORS(app)

# --- 로컬 테스트용 API 키 설정 ---
YOUTUBE_API_KEY = os.environ.get('YOUTUBE_API_KEY')


@app.route('/')
def home():
    """메인 페이지 (index.html)를 렌더링합니다."""
    return render_template('index.html')

@app.route('/api/search', methods=['POST'])
def search():
    """프론트엔드에서 받은 모든 필터 값으로 유튜브를 검색하고 가공하여 반환합니다."""
    try:
        params = request.get_json()
        print("✅ 프론트엔드로부터 받은 상세 주문서:", params)

        youtube = build('youtube', 'v3', developerKey=YOUTUBE_API_KEY)

        search_api_params = {
            'part': 'snippet',
            'q': params.get('query'),
            'type': 'video',
            'regionCode': params.get('region'),
            'maxResults': params.get('maxResults'),
            'order': params.get('sortOrder', 'relevance') 
        }

        if params.get('period'):
            try:
                days_to_subtract = int(params.get('period'))
                if days_to_subtract > 0:
                    published_after_date = datetime.now(timezone.utc) - timedelta(days=days_to_subtract)
                    search_api_params['publishedAfter'] = published_after_date.isoformat()
            except ValueError:
                pass 

        if params.get('videoLength') in ['short', 'medium', 'long']:
            search_api_params['videoDuration'] = params.get('videoLength')

        search_response = youtube.search().list(**search_api_params).execute()

        video_ids = []
        channel_ids = set()
        videos_base_info = []
        for item in search_response.get('items', []):
            video_id = item['id']['videoId']
            channel_id = item['snippet']['channelId']
            video_ids.append(video_id)
            channel_ids.add(channel_id)
            videos_base_info.append({
                'videoId': video_id, 'channelId': channel_id, 'title': item['snippet']['title'],
                'thumbnail': item['snippet']['thumbnails'].get('maxres', item['snippet']['thumbnails'].get('standard', item['snippet']['thumbnails'].get('high', item['snippet']['thumbnails']['default']))).get('url'),
                'channelTitle': item['snippet']['channelTitle'], 'publishedAt': item['snippet']['publishedAt']
            })

        if not video_ids:
            return jsonify({'items': []})

        video_stats_response = youtube.videos().list(
            part='statistics,contentDetails,status', 
            id=','.join(video_ids)
        ).execute()
        
        channel_stats_response = youtube.channels().list(
            part='statistics',
            id=','.join(list(channel_ids))
        ).execute()

        video_details = {item['id']: item for item in video_stats_response.get('items', [])}
        channel_stats = {item['id']: item['statistics'] for item in channel_stats_response.get('items', [])}

        results = []
        for video in videos_base_info:
            video_id = video['videoId']
            channel_id = video['channelId']

            if video_id not in video_details or channel_id not in channel_stats:
                continue 

            stats = video_details[video_id].get('statistics', {})
            content_details = video_details[video_id].get('contentDetails', {})
            status = video_details[video_id].get('status', {})
            is_made_for_kids = status.get('madeForKids', False)

            if params.get('excludeKids') and is_made_for_kids:
                continue 

            views = int(stats.get('viewCount', 0))
            likes = int(stats.get('likeCount', 0)) 
            subscribers = int(channel_stats.get(channel_id, {}).get('subscriberCount', 0))

            if views < int(params.get('minViews', 0)):
                continue 

            published_time = datetime.fromisoformat(video['publishedAt'].replace('Z', '+00:00'))
            now_time = datetime.now(timezone.utc)
            diff_hours = (now_time - published_time).total_seconds() / 3600
            vph = round(views / diff_hours) if diff_hours >= 1 else views

            if params.get('useVPH') and vph < int(params.get('minVPH', 0)):
                continue 

            duration_iso = content_details.get('duration', 'PT0S')
            duration_seconds = isodate.parse_duration(duration_iso).total_seconds()
            
            ratio = round((views / subscribers) * 100, 2) if subscribers > 0 else 0
            like_ratio = round((likes / views) * 100, 2) if views > 0 else 0 

            video.update({
                'viewCount': views,
                'likeCount': likes, 
                'subscriberCount': subscribers,
                'ratio': ratio,
                'likeRatio': like_ratio, 
                'vph': vph,
                'publishedAt_timestamp': published_time.timestamp(), 
                'publishedAt_formatted': published_time.strftime('%y-%m-%d'), # <--- Y를 y로 수정
                'duration_seconds': duration_seconds, 
                'duration_formatted': str(timedelta(seconds=int(duration_seconds)))
            })
            results.append(video)
        
        print(f"✅ 총 {len(results)}개의 필터링된 결과를 프론트엔드로 전송합니다.")
        return jsonify({'items': results})

    except Exception as e:
        print(f"❌ An error occurred: {e}") 
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True)