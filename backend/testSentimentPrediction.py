from backend.services import predict_sentiments


seniments  = predict_sentiments(['I am happy FOr the video', 'I am Sad'], "models/xgboostCls.pkl", "tfidf_vectorizer.pkl")
print(seniments)