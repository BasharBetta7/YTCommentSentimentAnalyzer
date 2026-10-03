from fastapi import FastAPI
from pydantic import BaseModel, Field
import os
import dotenv
from backend.services import fetch_comments, predict_sentiments
import requests
import pickle
from xgboost import XGBClassifier
from sklearn.feature_extraction.text import TfidfVectorizer
from transformers import AutoModelForSequenceClassification, AutoTokenizer, DataCollatorWithPadding

vectorizer_path = 'tfidf_vectorizer.pkl'
model_path = 'models/distillbert/checkpoint-49587'
tokenizer_path = 'saved_tokenizer'

with open(vectorizer_path, "rb") as f:
        vectorizer = pickle.load(f)
model = AutoModelForSequenceClassification.from_pretrained(model_path)
tokenizer = AutoTokenizer.from_pretrained(tokenizer_path)
dotenv.load_dotenv()
app = FastAPI()

class AnalyzeRequest(BaseModel):
    video_id: str = Field(min_length=1)
    max_comments: int = Field(default=100, ge=1, le=100)

class CommentResult(BaseModel):
    text: str
    sentiment: str

class AnalyzeResponse(BaseModel):
    video_id: str
    comments: list[CommentResult]


@app.get('/')
def root():
    return {"status":"ok"}


@app.post("/analyze", response_model=AnalyzeResponse)
def analyze(request: AnalyzeRequest):
    comments = fetch_comments(video_id=request.video_id, limit=request.max_comments)
    sentiments = predict_sentiments(comments=comments, model=model, tokenizer=tokenizer)
    results = [
         CommentResult(text=text, sentiment=sentiment) for text, sentiment in zip(comments, sentiments)
    ]

    return AnalyzeResponse(
         video_id=request.video_id,
         comments= results,
    )