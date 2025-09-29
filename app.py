# ===================================================================
#                      app.py (라우팅 구조 개선)
# ===================================================================
from dotenv import load_dotenv
load_dotenv(verbose=True, override=True)

import os
import json
import hashlib
import re
from datetime import datetime, timezone, timedelta

import isodate
import google.generativeai as genai
from google.generativeai.types import HarmCategory, HarmBlockThreshold
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

from flask import Flask, request, jsonify, render_template, redirect, url_for
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from flask_bcrypt import Bcrypt
from flask_login import LoginManager, UserMixin, login_user, logout_user, current_user, login_required
from flask_migrate import Migrate

app = Flask(__name__)
CORS(app)

# ==========================================================
# 블록 1: DB 및 로그인 설정
# ==========================================================
app.config['SECRET_KEY'] = os.environ.get('FLASK_SECRET_KEY', 'a_very_secret_key')
database_url = os.environ.get('DATABASE_URL', 'sqlite:///benchly.db')
if database_url and database_url.startswith("postgres://"):
    database_url = database_url.replace("postgres://", "postgresql://", 1)
app.config['SQLALCHEMY_DATABASE_URI'] = database_url
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)
bcrypt = Bcrypt(app)
migrate = Migrate(app, db)
login_manager = LoginManager(app)
login_manager.login_view = 'login_page'

@login_manager.unauthorized_handler
def unauthorized():
    if request.path.startswith('/api/'):
        return jsonify(success=False, error="로그인이 필요합니다."), 401
    return redirect(url_for('login_page'))

# ==========================================================
# 블록 2: 데이터베이스 모델
# ==========================================================
class Project(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    project_name = db.Column(db.String(100), nullable=False)
    created_at = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
    search_params_json = db.Column(db.Text, nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    search_results_json = db.Column(db.Text, nullable=True)

class User(db.Model, UserMixin):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(128), nullable=False)
    projects = db.relationship('Project', backref='owner', lazy=True, cascade="all, delete-orphan")

class SearchCache(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    search_hash = db.Column(db.String(64), unique=True, nullable=False, index=True)
    results_json = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))

class VideoViewStats(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    video_id = db.Column(db.String(20), nullable=False, index=True)
    timestamp = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
    view_count = db.Column(db.BigInteger)

@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))

# ==========================================================
# 블록 3: API 키 및 AI 모델 설정
# ==========================================================
YOUTUBE_API_KEY = os.environ.get('YOUTUBE_API_KEY')
GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY')
gemini_pro_model = None
gemini_flash_model = None

if GEMINI_API_KEY:
    try:
        genai.configure(api_key=GEMINI_API_KEY)
        generation_config = {"temperature": 0.7}
        safety_settings = {
            HarmCategory.HARM_CATEGORY_HARASSMENT: HarmBlockThreshold.BLOCK_NONE,
            HarmCategory.HARM_CATEGORY_HATE_SPEECH: HarmBlockThreshold.BLOCK_NONE,
            HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT: HarmBlockThreshold.BLOCK_NONE,
            HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT: HarmBlockThreshold.BLOCK_NONE,
        }
        # ▼▼▼ [수정] 사용 가능한 모델 목록에 있는 'gemini-pro-latest'와 'gemini-flash-latest'로 지정 ▼▼▼
        gemini_pro_model = genai.GenerativeModel("gemini-pro-latest", generation_config=generation_config, safety_settings=safety_settings)
        gemini_flash_model = genai.GenerativeModel("gemini-flash-latest", generation_config=generation_config, safety_settings=safety_settings)
        print("--- DEBUGGING AI --- Gemini AI 모델이 성공적으로 로드되었습니다.")
    except Exception as e:
        print(f"--- DEBUGGING AI --- Gemini 모델 로드 실패: {e}")
        
# ==========================================================
# 블록 4: 헬퍼 함수
# ==========================================================
def create_search_hash(params):
    sorted_params_string = json.dumps(params, sort_keys=True)
    return hashlib.sha256(sorted_params_string.encode('utf-8')).hexdigest()

def preprocess_script(script_text):
    if not script_text: return ""
    processed_text = re.sub(r'\[\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d{1,3})?\]', ' ', script_text)
    processed_text = re.sub(r'[\(\[].*?[\)\]]', ' ', processed_text)
    processed_text = re.sub(r'</?.*?>', '', processed_text)
    return re.sub(r'\s+', ' ', processed_text).strip()

# ==========================================================
# 블록 5: 핵심 라우트 (페이지) - 수정됨
# ==========================================================
@app.route('/')
def home():
    # ▼▼▼ [수정] 이제 로그인 여부와 관계없이 검색 페이지(index.html)를 보여줍니다. ▼▼▼
    extension_id = os.environ.get('EXTENSION_ID')
    return render_template('index.html', extension_id=extension_id)

# ▼▼▼ [신규] 대시보드를 위한 전용 경로를 생성합니다. ▼▼▼
@app.route('/dashboard')
@login_required 
def dashboard():
    extension_id = os.environ.get('EXTENSION_ID')
    projects = Project.query.filter_by(owner=current_user).order_by(Project.created_at.desc()).all()
    # 저장된 프로젝트가 없다면, 검색 페이지로 보냅니다.
    if not projects:
        return redirect(url_for('home'))
    return render_template('dashboard.html', projects=projects, extension_id=extension_id)

@app.route('/login')
def login_page():
    # ▼▼▼ [수정] 로그인 되어 있다면 대시보드로 보냅니다. ▼▼▼
    if current_user.is_authenticated: return redirect(url_for('dashboard'))
    return render_template('login.html')

@app.route('/register')
def register_page():
    # ▼▼▼ [수정] 로그인 되어 있다면 대시보드로 보냅니다. ▼▼▼
    if current_user.is_authenticated: return redirect(url_for('dashboard'))
    return render_template('register.html')

@app.route('/logout')
@login_required 
def logout():
    logout_user()
    # ▼▼▼ [수정] 로그아웃 후 검색 페이지로 보냅니다. ▼▼▼
    return redirect(url_for('home'))

# ==========================================================
# 블록 6: 핵심 API - 수정됨
# ==========================================================
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
        login_user(new_user)
        # ▼▼▼ [수정] 성공 시 대시보드 URL을 전달합니다. ▼▼▼
        return jsonify({"success": True, "message": "회원가입 성공!", "redirect_url": url_for('dashboard')})
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
            login_user(user)
            # ▼▼▼ [수정] 성공 시 대시보드 URL을 전달합니다. ▼▼▼
            return jsonify({"success": True, "message": "로그인 성공!", "redirect_url": url_for('dashboard')})
        else:
            return jsonify({"success": False, "error": "이메일 또는 비밀번호가 올바르지 않습니다."}), 401
    except Exception as e:
        print(f"❌ /api/login Error: {e}"); return jsonify({"success": False, "error": "서버 내부 오류가 발생했습니다."}), 500
        
# (이하 /api/project/... 및 /api/search 등 다른 API 코드는 변경사항 없음)
# ... (이전과 동일한 나머지 코드) ...
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

@app.route('/api/search', methods=['POST'])
@login_required 
def search():
    results = []
    try:
        params = request.get_json()
        if not params or not params.get('query'):
            return jsonify({"error": "검색어가 필요합니다."}), 400

        search_hash = create_search_hash(params)
        cache_duration = timedelta(hours=1)
        cached_result = SearchCache.query.filter_by(search_hash=search_hash).first()

        if cached_result and (datetime.now(timezone.utc) - cached_result.created_at.replace(tzinfo=timezone.utc) < cache_duration):
            print("✅ [Cache Hit!] DB에 저장된 캐시된 결과를 반환합니다.")
            return jsonify(json.loads(cached_result.results_json))

        youtube = build('youtube', 'v3', developerKey=YOUTUBE_API_KEY)

        search_api_params = {
            'part': 'snippet', 'type': 'video',
            'regionCode': params.get('region'), 'maxResults': params.get('maxResults'),
            'order': params.get('sortOrder', 'relevance'),
            'relevanceLanguage': params.get('language', 'ko')
        }
        search_type = params.get('searchType')

        if search_type == 'channel':
            channel_search_query = params.get('query')
            channel_search_response = youtube.search().list(part='snippet', q=channel_search_query, type='channel', maxResults=1).execute()

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
                    if days > 0:
                        search_api_params['publishedAfter'] = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
                except (ValueError, TypeError): pass 

        search_response = youtube.search().list(**search_api_params).execute()

        video_ids = [item['id']['videoId'] for item in search_response.get('items', []) if 'videoId' in item.get('id', {})]
        if not video_ids: return jsonify({'items': []})

        video_stats_response = youtube.videos().list(part='statistics,contentDetails,status,snippet', id=','.join(video_ids)).execute()
        video_details = {item['id']: item for item in video_stats_response.get('items', [])}

        channel_ids = {item['snippet']['channelId'] for item in video_stats_response.get('items', [])}
        channel_stats = {}
        if channel_ids:
            channel_stats_response = youtube.channels().list(part='statistics', id=','.join(list(channel_ids))).execute()
            channel_stats = {item['id']: item['statistics'] for item in channel_stats_response.get('items', [])}

        videos_base_info = [
            {'videoId': item['id']['videoId'], 'channelId': item['snippet']['channelId'], 'title': item['snippet']['title'],
             'channelTitle': item['snippet']['channelTitle'], 'publishedAt': item['snippet']['publishedAt']}
            for item in search_response.get('items', []) if 'videoId' in item.get('id', {})
        ]

        for video in videos_base_info:
            video_id = video['videoId']
            channel_id = video['channelId']

            if video_id not in video_details: continue

            stats = video_details[video_id].get('statistics', {})
            content_details = video_details[video_id].get('contentDetails', {})
            status = video_details[video_id].get('status', {})
            full_snippet = video_details[video_id].get('snippet', {})
            channel_stat_data = channel_stats.get(channel_id, {})

            if params.get('excludeKids') and status.get('madeForKids', False): continue

            views = int(stats.get('viewCount', 0))
            if views < int(params.get('minViews', 0)): continue

            published_time = datetime.fromisoformat(video['publishedAt'].replace('Z', '+00:00'))
            now_time = datetime.now(timezone.utc)
            diff_hours = (now_time - published_time).total_seconds() / 3600
            vph = round(views / diff_hours) if diff_hours >= 1 else views
            if params.get('useVPH') and vph < int(params.get('minVPH', 0)): continue

            duration_iso = content_details.get('duration', 'PT0S')
            duration_seconds = isodate.parse_duration(duration_iso).total_seconds()
            length_filter = params.get('videoLength')
            if length_filter == 'short' and duration_seconds >= 240: continue
            if length_filter == 'medium' and (duration_seconds < 240 or duration_seconds > 1200): continue
            if length_filter == 'long' and duration_seconds <= 1200: continue

            likes = int(stats.get('likeCount', 0))
            subscribers = int(channel_stat_data.get('subscriberCount', 0))
            ratio = round((views / subscribers) * 100, 2) if subscribers > 0 else 0
            like_ratio = round((likes / views) * 100, 2) if views > 0 else 0
            thumbnails = full_snippet.get('thumbnails', {})

            video.update({
                'thumbnail': thumbnails.get('high', thumbnails.get('medium', thumbnails.get('default', {}))).get('url', ''),
                'viewCount': views, 'likeCount': likes, 'subscriberCount': subscribers,
                'ratio': ratio, 'likeRatio': like_ratio, 'vph': vph,
                'publishedAt_timestamp': published_time.timestamp(),
                # ▼▼▼ 이 부분이 문제의 핵심! 이 줄이 포함된 버전으로 교체해야 해 ▼▼▼
                'publishedAt_formatted': published_time.strftime('%y-%m-%d'),
                'duration_seconds': duration_seconds,
                'duration_formatted': str(timedelta(seconds=int(duration_seconds))),
                'captionAvailable': content_details.get('caption', 'false') == 'true'
            })
            results.append(video)

        final_response_data = {'items': results}

        if cached_result:
            cached_result.results_json = json.dumps(final_response_data)
            cached_result.created_at = datetime.now(timezone.utc)
        else:
            new_cache = SearchCache(search_hash=search_hash, results_json=json.dumps(final_response_data))
            db.session.add(new_cache)

        db.session.commit()
        return jsonify(final_response_data) 
    except HttpError as e:
        error_content = json.loads(e.content.decode('utf-8'))
        error_message = error_content.get('error', {}).get('message', 'YouTube API Error')
        print(f"❌ YouTube API Error: {error_message}")
        return jsonify({"error": error_message}), e.resp.status
    except Exception as e:
        db.session.rollback()
        print(f"❌ /api/search Error: {e}")
        return jsonify({"error": str(e)}), 500
    
# ...
@app.route('/api/get_summary', methods=['POST'])
@login_required
def get_summary():
    if not generation_config or not safety_settings:
        return jsonify({"success": False, "error": "AI 모델 공용 설정이 로드되지 않았습니다."}), 500

    data = request.get_json()
    transcript = data.get('transcript')
    user_prompt = data.get('prompt')
    selected_model = data.get('model')

    # ▼▼▼ [수정] 허용 모델 리스트를 초기화한 모델 이름과 정확히 일치시킴 ▼▼▼
    allowed_models = ['gemini-flash-latest', 'gemini-pro-latest']
    if not transcript or not user_prompt or not selected_model:
        return jsonify({"success": False, "error": "스크립트, 프롬프트, 모델 이름이 모두 필요합니다."}), 400
    if selected_model not in allowed_models:
        return jsonify({"success": False, "error": f"허용되지 않은 모델입니다. 전송된 값: {selected_model}"}), 400

    try:
        cleaned_script = preprocess_script(transcript)
        
        # ▼▼▼ [수정] 분기 처리할 모델 이름을 정확히 일치시킴 ▼▼▼
        model_to_use = gemini_flash_model if selected_model == 'gemini-flash-latest' else gemini_pro_model
        
        final_prompt = f"{user_prompt}\n\n--- 분석할 스크립트 시작 ---\n{cleaned_script}\n--- 분석할 스크립트 끝 ---"

        response = model_to_use.generate_content(final_prompt)
        
        html_response = response.text.replace('\n', '<br>')
        html_response = re.sub(r'\*\*(.*?)\*\*', r'<strong>\1</strong>', html_response)
        
        return jsonify({ "success": True, "summary_html": html_response })

    except Exception as e:
        print(f"❌ /api/get_summary Error: {e}")
        return jsonify({"success": False, "error": f"AI 분석 중 오류 발생: {e}"}), 500


@app.route('/api/get_related_keywords', methods=['POST'])
@login_required
def get_related_keywords():
    if not gemini_flash_model:
        return jsonify({"success": False, "error": "AI 모델이 설정되지 않았습니다."}), 500

    data = request.get_json()
    query = data.get('query')
    target_lang = data.get('target_lang', 'ko')

    if not query:
        return jsonify({"success": False, "error": "키워드가 없습니다."}), 400

    try:
        language_map = {'ko': 'Korean', 'en': 'English', 'ja': 'Japanese'}
        target_language_name = language_map.get(target_lang, 'Korean')
        translated_query = query
        if target_lang != 'ko' and query:
            translation_prompt = f"Translate the following text to {target_language_name}. Return only the translated text, without any additional explanations or quotation marks.\n\n{query}"
            translated_query_response = gemini_flash_model.generate_content(translation_prompt)
            translated_query = translated_query_response.text.strip().replace('"', '')
        
        print(f"--- AI 번역 --- 원본: {query} -> 번역({target_lang}): {translated_query}")
        
        keyword_prompt_template = """
        You are an expert in analyzing YouTube content trends and generating search keywords for a specific language market. Your user is a YouTube creator looking for their next content idea.
        Your task is to take the user's search query and generate a total of 10 related keywords. These keywords must be divided into two distinct categories:
        1.  **Directly Related Keywords (5 keywords):** Generate 5 keywords that are specific variations or synonyms of the user's full search query. For example, if the query is "쿠팡꿀템", suggestions could be "쿠팡 추천템", "쿠팡 가성비 제품", "로켓배송 꿀템".
        2.  **Expansion Keywords (5 keywords):** Identify the core concept in the user's query (e.g., in "쿠팡꿀템", the core concept is "꿀템"). Generate 5 keywords by combining this core concept with other popular, related subjects. For "쿠팡꿀템", this could lead to "살림꿀템", "주방꿀템", "알리익스프레스 꿀템".
        The user's translated search query is: "{translated_query}"
        The target language for the output keywords is: **{target_language_name}**
        **CRUCIAL INSTRUCTION: You MUST generate the "original" keywords strictly in the specified target language: **{target_language_name}**. Do NOT output keywords in English unless the target language is "English".**
        After generating all 10 keywords in {target_language_name}, you must also provide the Korean translation for each keyword.
        You MUST return the results ONLY in a single, raw JSON object format. The JSON object must contain a single key named "keywords" which holds an array of all 10 generated objects. Each object must have two keys: "original" (the keyword in {target_language_name}) and "korean" (the Korean translation).
        """
        
        final_prompt = keyword_prompt_template.format(
            target_language_name=target_language_name,
            translated_query=translated_query
        )

        response = gemini_flash_model.generate_content(final_prompt)
        ai_response_text = response.text
        
        json_string = ai_response_text[ai_response_text.find('{'):ai_response_text.rfind('}')+1]
        
        if not json_string: raise Exception("AI 응답에서 JSON 객체를 찾을 수 없습니다.")

        parsed_json = json.loads(json_string)
        
        final_data = None
        if isinstance(parsed_json, dict):
            for key, value in parsed_json.items():
                if isinstance(value, list):
                    final_data = {'keywords': value}
                    break
        
        if final_data is None: raise Exception("AI가 반환한 JSON에서 키워드 리스트를 찾을 수 없습니다.")

        return jsonify({"success": True, "data": final_data, "translated_query": translated_query})

    except Exception as e:
        print(f"❌ AI 키워드 추천 에러: {e}")
        return jsonify({"success": False, "error": f"AI 응답 처리 중 오류 발생: {e}"}), 500

# ==========================================================
# 블록 8: 앱 실행
# ==========================================================
if __name__ == '__main__':
    with app.app_context():
        db.create_all()
    app.run(debug=True)