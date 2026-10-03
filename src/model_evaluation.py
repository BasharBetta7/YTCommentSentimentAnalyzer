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
import yaml
from transformers import AutoTokenizer, DataCollatorWithPadding, AutoModelForSequenceClassification, Trainer, TrainingArguments
from datasets import Dataset


logger = logging.getLogger('model_evaluation')


def load_params(params_path:str):
    try:
        with open(params_path, 'r') as f:
            params = yaml.safe_load(f)
        return params
    except Exception:
        raise Exception("Error loading params.yaml")

def eval_distillbert():
    model = AutoModelForSequenceClassification.from_pretrained('models/distillbert/checkpoint-49587')
    test_dataset = Dataset.load_from_disk('data/tokenized_test')
    tokenizer = AutoTokenizer.from_pretrained('./saved_tokenizer')
    collator = DataCollatorWithPadding(tokenizer=tokenizer)
    import evaluate
    accuracy = evaluate.load("accuracy")
    def compute_metrics(eval_pred):
        preds, labels = eval_pred
        predictions = np.argmax(preds, axis=1)
        return accuracy.compute(predictions=predictions, references=labels)
    trainer = Trainer(
        model= model,
        eval_dataset=test_dataset,
        args= TrainingArguments(
            output_dir='./eval_results',
            per_device_eval_batch_size=16,
            report_to='none',
        ),
        processing_class=tokenizer,
        compute_metrics=compute_metrics
    )
    metrics = trainer.evaluate()
    with open('metrics.json', 'w') as f:
        json.dump(metrics, f, indent=2)
    print(metrics)
    
def eval(params:dict):
    mlflow.set_experiment("YT_pipeline")
    mlflow.set_tracking_uri("http://localhost:5000")
    model = XGBClassifier(n_estimators=params['model_parameters']['n_estimators'],
                               max_depth=params['model_parameters']['max_depth'],
                                learning_rate=params['model_parameters']['learning_rate'])
    model.load_model(params["model_parameters"]["model_path"])

    with mlflow.start_run() as run:
        print(run.info.run_id)
        model_info = mlflow.xgboost.log_model(model, name=params["model_parameters"]["model_name"])
        mlflow.register_model(
            model_uri=model_info.model_uri,
            name=model_info.name,
        )
        mlflow.log_params(params['model_parameters'])
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
    params = load_params("params.yaml")
    eval_distillbert()