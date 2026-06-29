from langchain_openai import ChatOpenAI
from langchain.chains import create_history_aware_retriever, create_retrieval_chain
from langchain.chains.combine_documents import create_stuff_documents_chain
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder

from config.settings import AI_MODEL, LLM_TEMPERATURE, RETRIEVER_K


def get_context_retriever_chain(vectorstore):
    if vectorstore is None:
        return None

    llm = ChatOpenAI(model=AI_MODEL, temperature=LLM_TEMPERATURE)
    retriever = vectorstore.as_retriever(
        search_type="similarity",
        search_kwargs={"k": RETRIEVER_K},
    )
    rephrase_prompt = ChatPromptTemplate.from_messages([
        (
            "system",
            "Given the chat history and the latest user question, rewrite the "
            "question so it is fully self-contained — no pronouns that depend on "
            "history. Keep the original intent intact.",
        ),
        MessagesPlaceholder("chat_history"),
        ("human", "{input}"),
    ])
    return create_history_aware_retriever(llm, retriever, rephrase_prompt)


def get_conversational_rag_chain(retriever):
    if retriever is None:
        return None

    llm = ChatOpenAI(model=AI_MODEL, temperature=LLM_TEMPERATURE)
    qa_prompt = ChatPromptTemplate.from_messages([
        (
            "system",
            "You are a meticulous research assistant. Answer the user's question "
            "using ONLY the provided context (text excerpts, tables, and figure "
            "descriptions from research papers).\n\n"
            "Guidelines:\n"
            "1. Be comprehensive and technical.\n"
            "2. When the context contains a markdown table relevant to the "
            "   question, reproduce the table in your answer using markdown so "
            "   the user can see the data.\n"
            "3. When the context describes a figure or image, summarise the key "
            "   findings from the description.\n"
            "4. Cite the source document and page number when possible.\n"
            "5. If the context does not contain enough information, clearly state "
            "   what you cannot answer.\n\n"
            "Context:\n{context}",
        ),
        MessagesPlaceholder("chat_history"),
        ("human", "{input}"),
    ])
    doc_chain = create_stuff_documents_chain(llm, qa_prompt)
    return create_retrieval_chain(retriever, doc_chain)
