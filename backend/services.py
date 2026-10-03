import requests
import os
from xgboost import XGBClassifier
from sklearn.feature_extraction.text import TfidfVectorizer
import pickle
from src.data_ingestion import preprocess, sentiment_dict
import dotenv
from transformers import AutoModelForSequenceClassification, AutoTokenizer, DataCollatorWithPadding
sentiment_dict_rev = {v:k for k,v in sentiment_dict.items()}

def fetch_comments(video_id: str, limit:int = 10) -> list[str]:
    dotenv.load_dotenv()
    response = requests.get(
        "https://www.googleapis.com/youtube/v3/commentThreads",
        params={
            "key": os.environ["YT_API_KEY"],
            "part": "snippet",
            "videoId": video_id,
            "maxResults":limit,
            "textFormat": "plainText",
            "order": "time",
        },
        timeout=15,
    )
    response.raise_for_status()

    return [
        item["snippet"]["topLevelComment"]["snippet"]["textDisplay"]
        for item in response.json().get("items", [])
    ]

def predict_sentiments(comments:list[str], model: AutoModelForSequenceClassification, tokenizer: AutoTokenizer) -> list[str]:
    comments_processed = [preprocess(cmt) for cmt in comments]
    preds = model(**tokenizer(comments_processed, padding=True, return_tensors='pt')).logits.argmax(dim=-1)
    
    return [sentiment_dict_rev[p.item()] for p in preds]

    
# if __name__ == '__main__':
#     dotenv.load_dotenv()
#     response = fetch_comments(video_id="w71RHxAWxaM")
#     print(f"{response= }")
