from sklearn.feature_extraction.text import TfidfVectorizer
import pandas as pd
import pickle
import numpy as np
from sklearn.model_selection import train_test_split
import yaml
import logging

logger = logging.getLogger('feature_engineering')




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
        main(df)
    except Exception as e:
        logging.exception(f"Error during feature engineering: {e}")
        raise 


