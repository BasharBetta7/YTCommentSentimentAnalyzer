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
import json
import logging

logger = logging.getLogger('model_evaluation')


def eval(model_path):
    mlflow.set_experiment("YT_pipeline")
    mlflow.set_tracking_uri("http://localhost:5000")
    model = XGBClassifier()
    model.load_model(model_path)

    with mlflow.start_run() as run:
        print(run.info.run_id)
        model_info = mlflow.xgboost.log_model(model, name='XGboostClassifier')
        mlflow.register_model(
            model_uri=model_info.model_uri,
            name=model_info.name,
        )
        X_test = np.load('data/test_feats.npy', allow_pickle=True)
        y_test = np.load('data/test_targets.npy', allow_pickle=True)
        y_pred = model.predict(X_test)
        cls_rep = classification_report(y_test, y_pred, output_dict=True)
        for label, metrics in cls_rep.items():
            if isinstance(metrics, dict):
                for metric, value in metrics.items():
                    mlflow.log_metric(f"{label}_{metric}", value)
        
       
        accuracy = accuracy_score(y_test, y_pred)
        mlflow.log_metric('accuracy', accuracy)

        cf = confusion_matrix(y_test, y_pred)
        plt.figure(figsize=(10,8))
        sns.heatmap(cf, annot=True, fmt='d', cmap='Blues')
        plt.title('Confusion Matrix')
        plt.xlabel('Predicted')
        plt.ylabel('Actual')
        plt.savefig('artifacts/confusion_matrix.png')
        mlflow.log_artifact('artifacts/confusion_matrix.png', 'confusion_matrix.png')
        with open('metrics.json', 'w') as f:
            json.dump({"accuracy":float(accuracy)}, f, indent=2, )


if __name__ == '__main__':
    eval('models/xgboostCls.pkl')