from sklearn.feature_extraction.text import CountVectorizer, TfidfVectorizer
import mlflow
import optuna
from sklearn.ensemble import RandomForestClassifier
from xgboost import XGBClassifier
from sklearn.metrics import accuracy_score, f1_score, confusion_matrix, classification_report
from sklearn.feature_extraction.text import CountVectorizer
from sklearn.model_selection import train_test_split, cross_val_predict, StratifiedKFold
import matplotlib.pyplot as plt
import pandas as pd
import seaborn as sns
from pathlib import Path
import numpy as np
import logging
import mlflow


logger = logging.getLogger('build_model')


def train_model(model_path):
    X_train = np.load("data/samples_feats.npy", allow_pickle=True)
    y_train= np.load("data/samples_targets.npy", allow_pickle= True)
    model = XGBClassifier(n_estimators=15, max_depth=5, learning_rate=0.93)
    logger.info("Model Training ...")
    model.fit(X_train, y_train)
    model.save_model(model_path)
    logger.info(f"Model saved in {model_path}")
        


if __name__ == '__main__':
    logging.basicConfig(
        format="%(asctime)s | %(levelname)s | %(name)s | %(message)s ",
        handlers=[
            logging.FileHandler('pipeline.log', encoding='utf-8'),
            logging.StreamHandler(),
        ]
    )
    try:
        train_model("models/xgboostCls.pkl")
    except Exception:
        logger.exception(f"Error while building the model")
        raise


