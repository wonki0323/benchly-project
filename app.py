from flask import Flask, request, jsonify, render_template, redirect, url_for
from flask_cors import CORS
from googleapiclient.discovery import build
import os
from datetime import datetime, timezone, timedelta
import isodate
from flask_sqlalchemy import SQLAlchemy      
from flask_bcrypt import Bcrypt            
from flask_login import LoginManager, UserMixin, login_user, logout_user, current_user, login_required 
import json
from flask_migrate import Migrate 
import hashlib 

app = Flask(__name__)
CORS(app)

# ==========================================================
# ★★★ DB 설정 수정 ★★★
# ==========================================================
app.config['SECRET_KEY'] = 'your_very_secret_random_string_here' 

# 1. Render의 'DATABASE_URL' (PostgreSQL 주소) 환경 변수를 우선적으로 찾습니다.
# 2. 만약 없다면 (즉, 우리 로컬 컴퓨터라면), 기존의 sqlite:///benchly.db 파일을 사용합니다.
database_url = os.environ.get('DATABASE_URL')
if database_url:
    # Render는 postgres:// 주소를 사용하지만, SQLAlchemy는 postgresql://을 선호하므로 변경해줍니다.
    database_url = database_url.replace("postgres://", "postgresql://", 1)

app.config['SQLALCHEMY_DATABASE_URI'] = database_url or 'sqlite:///benchly.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False 

db = SQLAlchemy(app)     
bcrypt = Bcrypt(app)   
migrate = Migrate(app, db) 

login_manager = LoginManager(app)
# (이하 모든 DB 모델, 라우트, API 로직 코드는 이전과 100% 동일합니다.)
# ... (이전과 동일한 모든 app.py 코드) ...
# ==========================================================
# (이하 모든 app.py 코드는 이전 버전과 동일합니다. 생략 없이 전체 코드를 붙여넣습니다.)
# ==========================================================
class User(db.Model, UserMixin):
    id = db.Column(db.Integer, primary_key=True); username = db.Column(db.String(80), unique=True, nullable=False); email = db.Column(db.String(120), unique=True, nullable=False); password_hash = db.Column(db.String(128), nullable=False); projects = db.relationship('Project', backref='owner', lazy=True, cascade="all, delete-orphan")
    def __repr__(self): return f'<User {self.username}>'

class Project(db.Model):
    id = db.Column(db.Integer, primary_key=True); project_name = db.Column(db.String(100), nullable=False); created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow); search_params_json = db.Column(db.Text, nullable=False); user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False); search_results_json = db.Column(db.Text, nullable=True) 
    def __repr__(self): return f'<Project {self.project_name}>'

class SearchCache(db.Model):
    id = db.Column(db.Integer, primary_key=True); search_hash = db.Column(db.String(64), unique=True, nullable=False, index=True); results_json = db.Column(db.Text, nullable=False); created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
# ==========================================================


@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))

YOUTUBE_API_KEY = os.environ.get('YOUTUBE_API_KEY') # 배포용 코드로 유지
print(f"--- DEBUGGING KEY --- Loaded API Key: {YOUTUBE_API_KEY}")

def create_search_hash(params):
    sorted_params_string = json.dumps(params, sort_keys=True)
    return hashlib.sha256(sorted_params_string.encode('utf-8')).hexdigest()

@app.route('/login')
def login_page():
    if current_user.is_authenticated: return redirect(url_for('home'))
    return render_template('login.html')
@app.route('/register')
def register_page():
    if current_user.is_authenticated: return redirect(url_for('home'))
    return render_template('register.html')
@app.route('/logout')
@login_required 
def logout():
    logout_user(); return redirect(url_for('home')) 
@app.route('/api/register', methods=['POST'])
def api_register():
    try:
        data = request.get_json(); username, email, password = data.get('username'), data.get('email'), data.get('password')
        if not all([username, email, password]): return jsonify({"success": False, "error": "모든 필드를 입력해야 합니다."}), 400
        if User.query.filter_by(email=email).first() or User.query.filter_by(username=username).first():
             return jsonify({"success": False, "error": "이미 사용 중인 이메일 또는 사용자 이름입니다."}), 400
        hashed_password = bcrypt.generate_password_hash(password).decode('utf-8')
        new_user = User(username=username, email=email, password_hash=hashed_password)
        db.session.add(new_user); db.session.commit()
        return jsonify({"success": True, "message": "회원가입 성공!"})
    except Exception as e:
        db.session.rollback(); print(f"❌ /api/register Error: {e}")
        return jsonify({"success": False, "error": "서버 내부 오류가 발생했습니다."}), 500
@app.route('/api/login', methods=['POST'])
def api_login():
    try:
        data = request.get_json(); email, password = data.get('email'), data.get('password')
        if not email or not password: return jsonify({"success": False, "error": "이메일과 비밀번호를 입력해주세요."}), 400
        user = User.query.filter_by(email=email).first()
        if user and bcrypt.check_password_hash(user.password_hash, password):
            login_user(user); return jsonify({"success": True, "message": "로그인 성공!"})
        else:
            return jsonify({"success": False, "error": "이메일 또는 비밀번호가 올바르지 않습니다."}), 401
    except Exception as e:
        print(f"❌ /api/login Error: {e}"); return jsonify({"success": False, "error": "서버 내부 오류가 발생했습니다."}), 500
@app.route('/api/project/save', methods=['POST'])
@login_required 
def save_project():
    try:
        data = request.get_json()
        project_name, search_params, search_results = data.get('projectName'), data.get('searchParams'), data.get('searchResults')
        if not project_name or not search_params or search_results is None:
            return jsonify({"success": False, "error": "프로젝트 이름, 검색 조건, 검색 결과가 모두 필요합니다."}), 400
        search_params_string, search_results_string = json.dumps(search_params), json.dumps(search_results) 
        new_project = Project(project_name=project_name, search_params_json=search_params_string, search_results_json=search_results_string, owner=current_user)
        db.session.add(new_project); db.session.commit()
        return jsonify({"success": True, "message": f"'{project_name}' 프로젝트가 저장되었습니다."})
    except Exception as e:
        db.session.rollback(); print(f"❌ /api/project/save Error: {e}")
        return jsonify({"success": False, "error": "프로젝트 저장 중 서버 오류 발생"}), 500
@app.route('/api/project/get/<int:project_id>', methods=['GET'])
@login_required
def get_project(project_id):
    try:
        project = Project.query.get_or_404(project_id)
        if project.owner.id != current_user.id:
            return jsonify({"success": False, "error": "권한이 없습니다."}), 403
        return jsonify({"success": True, "search_params_json": project.search_params_json, "search_results_json": project.search_results_json})
    except Exception as e:
        print(f"❌ /api/project/get Error: {e}"); return jsonify({"success": False, "error": "프로젝트 로드 중 서버 오류 발생"}), 500
@app.route('/api/project/delete/<int:project_id>', methods=['DELETE'])
@login_required
def delete_project(project_id):
    try:
        project_to_delete = Project.query.get_or_404(project_id)
        if project_to_delete.owner.id != current_user.id:
            return jsonify({"success": False, "error": "삭제 권한이 없습니다."}), 403 
        db.session.delete(project_to_delete); db.session.commit()
        return jsonify({"success": True, "message": "프로젝트가 삭제되었습니다."})
    except Exception as e:
        db.session.rollback(); print(f"❌ /api/project/delete Error: {e}")
        return jsonify({"success": False, "error": "프로젝트 삭제 중 서버 오류 발생"}), 500
@app.route('/')
def home():
    if current_user.is_authenticated:
        projects = Project.query.filter_by(owner=current_user).order_by(Project.created_at.desc()).all()
        if projects:
            return render_template('dashboard.html', projects=projects) 
        else:
            return render_template('index.html')
    else:
        return render_template('index.html')
@app.route('/search')
@login_required 
def search_page():
    return render_template('index.html')
@app.route('/api/search', methods=['POST'])
@login_required 
def search():
    try:
        params = request.get_json()
        print("✅ 프론트엔드로부터 받은 상세 주문서:", params)
        search_hash = create_search_hash(params)
        cache_duration = timedelta(hours=1) 
        cached_result = SearchCache.query.filter_by(search_hash=search_hash).first()
        if cached_result and (datetime.utcnow() - cached_result.created_at < cache_duration):
            print("✅ [Cache Hit!] DB에 저장된 캐시된 결과를 반환합니다.")
            return jsonify(json.loads(cached_result.results_json)) 
        print("❌ [Cache Miss] 캐시가 없거나 만료되었습니다. YouTube API를 호출합니다.")
        youtube = build('youtube', 'v3', developerKey=YOUTUBE_API_KEY)
        search_api_params = {'part': 'snippet', 'type': 'video', 'regionCode': params.get('region'), 'maxResults': params.get('maxResults'), 'order': params.get('sortOrder', 'relevance'), 'relevanceLanguage': params.get('language', 'ko')}
        search_type = params.get('searchType')
        if search_type == 'channel':
            channel_search_response = youtube.search().list(part='snippet', q=params.get('query'), type='channel', maxResults=1).execute()
            if not channel_search_response.get('items'): return jsonify({'items': []}) 
            target_channel_id = channel_search_response['items'][0]['snippet']['channelId']
            search_api_params['channelId'] = target_channel_id
            search_api_params['order'] = 'date' 
            if 'q' in search_api_params: del search_api_params['q'] 
        else:
            search_api_params['q'] = params.get('query')
            if params.get('period'):
                try:
                    days = int(params.get('period'))
                    if days > 0: search_api_params['publishedAfter'] = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
                except ValueError: pass 
            if params.get('videoLength') in ['short', 'medium', 'long']:
                search_api_params['videoDuration'] = params.get('videoLength')
        search_response = youtube.search().list(**search_api_params).execute()
        video_ids, channel_ids, videos_base_info = [], set(), []
        for item in search_response.get('items', []):
            video_id, channel_id = item['id']['videoId'], item['snippet']['channelId']
            video_ids.append(video_id); channel_ids.add(channel_id)
            videos_base_info.append({'videoId': video_id, 'channelId': channel_id, 'title': item['snippet']['title'], 'channelTitle': item['snippet']['channelTitle'], 'publishedAt': item['snippet']['publishedAt']})
        if not video_ids: return jsonify({'items': []})
        video_stats_response = youtube.videos().list(part='statistics,contentDetails,status,snippet', id=','.join(video_ids)).execute()
        channel_ids.update({item['snippet']['channelId'] for item in video_stats_response.get('items', [])}) 
        channel_stats_response = youtube.channels().list(part='statistics', id=','.join(list(channel_ids))).execute()
        video_details = {item['id']: item for item in video_stats_response.get('items', [])}; channel_stats = {item['id']: item['statistics'] for item in channel_stats_response.get('items', [])}
        results = []; requested_lang_code = params.get('language', 'ko').split('-')[0]
        for video in videos_base_info:
            video_id, channel_id = video['videoId'], video['channelId']
            if video_id not in video_details: continue 
            channel_stat_data = channel_stats.get(channel_id, {})
            full_snippet = video_details[video_id].get('snippet', {}); video_lang, audio_lang = full_snippet.get('defaultLanguage', '').split('-')[0], full_snippet.get('defaultAudioLanguage', '').split('-')[0]
            if requested_lang_code and (video_lang != requested_lang_code and audio_lang != requested_lang_code): continue
            stats, content_details, status = video_details[video_id].get('statistics', {}), video_details[video_id].get('contentDetails', {}), video_details[video_id].get('status', {})
            is_made_for_kids = status.get('madeForKids', False)
            thumbnails = full_snippet.get('thumbnails', {}); video['thumbnail'] = thumbnails.get('maxres', thumbnails.get('standard', thumbnails.get('high', thumbnails.get('default', {})))).get('url', '')
            if params.get('excludeKids') and is_made_for_kids: continue
            views, likes, subscribers = int(stats.get('viewCount', 0)), int(stats.get('likeCount', 0)), int(channel_stat_data.get('subscriberCount', 0))
            if views < int(params.get('minViews', 0)): continue
            published_time = datetime.fromisoformat(video['publishedAt'].replace('Z', '+00:00')); now_time = datetime.now(timezone.utc)
            diff_hours = (now_time - published_time).total_seconds() / 3600; vph = round(views / diff_hours) if diff_hours >= 1 else views
            if params.get('useVPH') and vph < int(params.get('minVPH', 0)): continue
            duration_iso = content_details.get('duration', 'PT0S'); duration_seconds = isodate.parse_duration(duration_iso).total_seconds()
            if params.get('videoLength') == 'short' and duration_seconds >= 240: continue
            if params.get('videoLength') == 'medium' and (duration_seconds < 240 or duration_seconds > 1200): continue
            if params.get('videoLength') == 'long' and duration_seconds <= 1200: continue
            ratio = round((views / subscribers) * 100, 2) if subscribers > 0 else 0; like_ratio = round((likes / views) * 100, 2) if views > 0 else 0
            video.update({'viewCount': views, 'likeCount': likes, 'subscriberCount': subscribers, 'ratio': ratio, 'likeRatio': like_ratio, 'vph': vph, 'publishedAt_timestamp': published_time.timestamp(), 'publishedAt_formatted': published_time.strftime('%y-%m-%d'), 'duration_seconds': duration_seconds, 'duration_formatted': str(timedelta(seconds=int(duration_seconds)))})
            results.append(video)
        final_response_data = {'items': results}
        if cached_result:
            cached_result.results_json = json.dumps(final_response_data); cached_result.created_at = datetime.utcnow()
        else:
            new_cache = SearchCache(search_hash=search_hash, results_json=json.dumps(final_response_data))
            db.session.add(new_cache)
        db.session.commit()
        print(f"✅ 총 {len(results)}개의 필터링된 결과를 API로부터 가져와 캐시에 저장했습니다.")
        return jsonify(final_response_data) 
    except Exception as e:
        db.session.rollback()
        print(f"❌ An error occurred: {e}"); return jsonify({"error": str(e)}), 500

# --- '캐시 청소부' 스케줄러 명령어 ---
@app.cli.command("clean_cache")
def clean_cache():
    """만료된(예: 2시간 지난) 캐시 레코드를 삭제합니다."""
    try:
        expiry_time = datetime.utcnow() - timedelta(hours=2) # 2시간 이상 지난 캐시는 삭제
        expired_items = SearchCache.query.filter(SearchCache.created_at < expiry_time).all()
        if not expired_items:
            print("🧹 캐시 청소: 만료된 캐시가 없습니다.")
            return
        for item in expired_items:
            db.session.delete(item)
        db.session.commit()
        print(f"🧹 캐시 청소: 총 {len(expired_items)}개의 만료된 캐시를 삭제했습니다.")
    except Exception as e:
        db.session.rollback()
        print(f"❌ 캐시 청소 중 에러 발생: {e}")


if __name__ == '__main__':
    app.run(debug=True)