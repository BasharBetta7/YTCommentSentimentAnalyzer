from sklearn.feature_extraction.text import TfidfVectorizer
import pandas as pd
import pickle
import numpy as np
from sklearn.model_selection import train_test_split
import yaml
import logging
from datasets import Dataset
from transformers import DataCollatorWithPadding, AutoTokenizer
import torch

logger = logging.getLogger('feature_engineering')


def tokenize_dataset(df:pd.DataFrame):
    df = df.rename(columns={"CommentText":"text", "Sentiment":"labels"})
    df['text'] = df['text'].astype(str)
    df_train = df.sample(frac=0.8, replace=False, random_state=42)
    df_test = df[~df['text'].isin(df_train['text'])]
    train_dataset = Dataset.from_pandas(df_train,preserve_index=False)
    test_dataset = Dataset.from_pandas(df_test, preserve_index=False)
    tokenizer = AutoTokenizer.from_pretrained("distilbert/distilbert-base-uncased")
    tokenizer.save_pretrained("./saved_tokenizer")
    logging.info("Tokenizer saved as saved_tokenizer")

    tokenized_train_dataset = train_dataset.map(
        lambda batch: tokenizer(batch['text'],
                                truncation=True,
                                max_length=512),
                                batched=True,
                                remove_columns=["text"],
    )

    tokenized_test_dataset = test_dataset.map(
        lambda batch: tokenizer(batch['text'],
                                    truncation=True,
                                    max_length=512),
                                    batched=True,
                                    remove_columns=["text"],
    )
    tokenized_train_dataset.save_to_disk('data/tokenized_train')
    tokenized_test_dataset.save_to_disk('data/tokenized_test')
    logging.info(f"Train/Test Tokenized Datasets saved in data/ ")


    

def main(df:pd.DataFrame):
    with open("params.yaml", "r") as f:
        params = yaml.safe_load(f)
    
    logger.info("Extracting features from textual data ...")
    df.dropna(inplace=True)
    vectorizer = TfidfVectorizer(ngram_range=tuple(params['feature_engineering']['ngram_range']), max_features=200)
    X = vectorizer.fit_transform(df['CommentText']).toarray()
    with open("tfidf_vectorizer.pkl", "wb") as f:
        pickle.dump(vectorizer, f)
    y = df['Sentiment']
    X_train, X_test,y_train, y_test = train_test_split(X,y, test_size=params['feature_engineering']['test_size'], random_state=42)
    np.save('data/samples_feats.npy', X_train)
    np.save('data/samples_targets.npy', y_train)
    np.save('data/test_feats.npy', X_test)
    np.save('data/test_targets.npy', y_test)

    logging.info("Samples and targets are saved ")



if __name__ == '__main__':
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
        handlers=[
            logging.FileHandler("pipeline.log", encoding='utf-8',mode='a'),
            logging.StreamHandler(),
        ]
    )
    try:
        df = pd.read_csv('data/preprocessed_data.csv')
        
        tokenize_dataset(df)
    except Exception as e:
        logging.exception(f"Error during feature engineering: {e}")
        raise 


