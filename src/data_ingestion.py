import pandas as pd
import re
from nltk.corpus import stopwords
from nltk import WordNetLemmatizer
import pandas as pd
from pathlib import Path

sentiment_dict = {'Positive':2,'Neutral':1,'Negative':0}

def preprocess(comment):
    """Accept a comment column, and perform preprcoessing on it
    """
    comment = comment.lower()
    comment = comment.strip()
    comment = comment.replace('\n',' ')
    comment = re.sub(r'[^A-Za-z0-9\s!?.,]','', comment)    
    stop_words = set(stopwords.words('english')) - {'but','not','however','no','yet'}
    comment = ' '.join([word for word in comment.split() if word not in stop_words])
    lemmatizer = WordNetLemmatizer()
    comment = ' '.join([lemmatizer.lemmatize(word) for word in comment.split()])

    return comment


def main():
    """Read data from source, and perform data processing"""
    try:
        print("Ingesting the dataset ...")
        df = pd.read_csv("hf://datasets/AmaanP314/youtube-comment-sentiment/youtube-comments-sentiment.csv")
        df_reduced = df[['CommentText','Sentiment']]
        df_reduced['Sentiment'] = df_reduced['Sentiment'].apply(lambda x : sentiment_dict[x])
        df_reduced = df_reduced[~(df_reduced['CommentText'].str.strip() == '')]
        df_reduced.dropna(inplace=True)
        df_reduced.drop_duplicates(inplace=True)
        print("Pre-processing data ...")
        df_reduced['CommentText'] = df_reduced['CommentText'].apply(lambda x : preprocess(x))
        df_reduced.to_csv("./data/preprocessed_data.csv", index=False)
    except Exception as e:
        print(f"Error while ingesting the data: {e}")
    

if __name__ == '__main__':
    main()
