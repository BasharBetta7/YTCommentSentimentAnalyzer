from sklearn.feature_extraction.text import CountVectorizer, TfidfVectorizer
import mlflow
import optuna
from sklearn.ensemble import RandomForestClassifier
from xgboost import XGBClassifier
from lightgbm import LGBMClassifier
from sklearn.metrics import accuracy_score, f1_score, confusion_matrix, classification_report
from sklearn.feature_extraction.text import CountVectorizer
from sklearn.model_selection import train_test_split, cross_val_predict, StratifiedKFold
import matplotlib.pyplot as plt
import pandas as pd
import seaborn as sns
from pathlib import Path
import numpy as np
import logging
import pickle
import mlflow
from model_evaluation import load_params
from transformers import AutoTokenizer, DataCollatorWithPadding, AutoModelForSequenceClassification, Trainer, TrainingArguments
from datasets import Dataset
import evaluate

logger = logging.getLogger('build_model')
label2id = {'Positive':2,'Neutral':1,'Negative':0}
id2label = {v:k for k,v in label2id.items()}

accuracy = evaluate.load("accuracy")
def compute_metrics(eval_pred):
    preds, labels = eval_pred
    predictions = np.argmax(preds, axis=1)
    return accuracy.compute(predictions=predictions, references=labels)

def build_train_distillbert():
    model = AutoModelForSequenceClassification.from_pretrained("distilbert/distilbert-base-uncased",
                                                           num_labels=3,
                                                           id2label=id2label,
                                                           label2id=label2id)
    tokenized_train_dataset = Dataset.load_from_disk('data/tokenized_train')
    tokenized_test_dataset = Dataset.load_from_disk('data/tokenized_test')
    tokenizer = AutoTokenizer.from_pretrained('./saved_tokenizer')
    collator = collator = DataCollatorWithPadding(tokenizer=tokenizer)
    training_args = TrainingArguments(
        output_dir="models/distillbert",
        learning_rate=2e-5,
        per_device_train_batch_size=16,
        per_device_eval_batch_size=16,
        logging_strategy='steps',
        logging_steps=10,
        save_steps=100,
        num_train_epochs=1,
        eval_strategy='epoch',
        save_strategy='epoch',
        report_to=['mlflow'],
        load_best_model_at_end=True,
    )
    trainer = Trainer(
        model = model, 
        args=training_args,
        train_dataset=tokenized_train_dataset,
        eval_dataset=tokenized_test_dataset,
        data_collator=collator,
        compute_metrics=compute_metrics,
    )

    import mlflow
    mlflow.set_tracking_uri('http://localhost:5000')
    mlflow.set_experiment('YT-transformer-training')
    with mlflow.start_run() as run:
        trainer.train()
        trainer.evaluate()
    

def train_model(params:dict):
    X_train = np.load("data/samples_feats.npy", allow_pickle=True)
    y_train= np.load("data/samples_targets.npy", allow_pickle= True)
    model_name = params['model_parameters'].get('model_name',None)
    print(f"{model_name= }")
    print(params['model_parameters'])
    if model_name is None:
        raise Exception("No model name specified in params.yaml")
    if model_name == 'lightgbm':
        model = LGBMClassifier(n_estimators=15, max_depth=5, learning_rate=0.93)
        
        logger.info("Model Training ...")
        model.fit(X_train, y_train)
        model_path  = params['model_parameters']['model_path']
        with open(model_path, 'wb') as f:
            pickle.dump(model, f)
        logger.info(f"Model saved in {model_path}")
    if model_name == 'xgboost':
        model = XGBClassifier(n_estimators=params['model_parameters']['n_estimators'],
                               max_depth=params['model_parameters']['max_depth'],
                                learning_rate=params['model_parameters']['learning_rate'])
        logger.info("Model Training ...")
        model.fit(X_train, y_train)
        model_path  = params['model_parameters']['model_path']
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
        params = load_params("params.yaml")
        build_train_distillbert()
    except Exception:
        logger.exception(f"Error while building the model")
        raise


