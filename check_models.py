# check_models.py
import google.generativeai as genai
import os
from dotenv import load_dotenv

# 1. .env 파일 로드 (app.py와 동일한 위치에 있어야 함)
load_dotenv()

# 2. API 키 설정
GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY')
if not GEMINI_API_KEY:
    print("❌ 오류: .env 파일에서 GEMINI_API_KEY를 찾을 수 없습니다.")
    exit()
    
genai.configure(api_key=GEMINI_API_KEY)

print("Google AI API에 연결하여 사용 가능한 모델을 확인합니다...")
print("="*40)

try:
    # 3. 모델 리스트 요청
    #    list_models()는 v1beta, v1 등 모든 API 버전에서 호환됩니다.
    models = genai.list_models()
    
    found_model = False
    
    # 4. 'generateContent' (우리가 필요한 기능)를 지원하는 모델만 필터링
    for m in models:
        if 'generateContent' in m.supported_generation_methods:
            print(f"✅ 사용 가능한 모델: {m.name}")
            found_model = True
    
    if not found_model:
        print("❌ 'generateContent'를 지원하는 모델을 찾을 수 없습니다.")
    
    print("="*40)
    print("팁: 위 목록(✅)에 있는 '모델 이름' (예: 'models/gemini-1.5-pro-latest')을 복사하여 app.py의 'model_name=' 부분에 사용하세요.")
    
except Exception as e:
    print(f"❌ API 연결 또는 모델 목록 조회 중 오류 발생:")
    print(e)